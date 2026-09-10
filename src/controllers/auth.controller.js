import bcrypt from 'bcrypt';
import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';
import { generateOTP, verifyOTP } from '../services/otp.service.js';
import { generateToken } from '../utils/jwt.js';

// Send / Generate OTP
export async function handleSendOtp(req, res) {
  const { phoneNumber } = req.body || {};

  if (!phoneNumber) {
    res.writeHead(400);
    return res.end(
      JSON.stringify({
        error: "Phone number is required",
      }),
    );
  }

  try {
    await generateOTP(phoneNumber);

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    return res.end(
      JSON.stringify({
        message: "OTP sent successfully",
      }),
    );
  } catch (err) {
    console.error("Send OTP Error:", err);

    res.writeHead(500, {
      "Content-Type": "application/json",
    });

    return res.end(
      JSON.stringify({
        error: "Failed to send OTP",
      }),
    );
  }
}

// Register User
export async function handleRegister(req, res) {
  const { username, email, phoneNumber, password, fullName, otp } = req.body || {};

  if (!username || !phoneNumber || !password || !otp) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Username, phone number, password, and OTP are required' }));
  }

  // Verify OTP
  const isValidOtp = verifyOTP(phoneNumber, otp);
  if (!isValidOtp) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Invalid or expired OTP' }));
  }

  let connection;
  try {
    connection = await getConnection();

    // Check if username or phone exists
    const checkSql = `SELECT USERNAME, PHONE_NUMBER FROM USERS WHERE USERNAME = :username OR PHONE_NUMBER = :phoneNumber`;
    const checkResult = await connection.execute(checkSql, { username, phoneNumber });

    if (checkResult.rows && checkResult.rows.length > 0) {
      res.writeHead(409);
      return res.end(JSON.stringify({ error: 'Username or Phone Number already registered' }));
    }

    // Hash Password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert into USERS table
    const insertSql = `
      INSERT INTO USERS (USERNAME, EMAIL, PHONE_NUMBER, PASSWORD_HASH, FULL_NAME)
      VALUES (:username, :email, :phoneNumber, :passwordHash, :fullName)
      RETURNING USER_ID INTO :userId
    `;

    const result = await connection.execute(
      insertSql,
      {
        username,
        email: email || null,
        phoneNumber,
        passwordHash,
        fullName: fullName || null,
        userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );

    // Explicitly commit transaction
    await connection.commit();

    const newUserId = result.outBinds.userId[0];

    res.writeHead(201);
    return res.end(JSON.stringify({ 
      message: 'User registered successfully', 
      userId: newUserId 
    }));

  } catch (err) {
    console.error('Registration Error Details:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) { console.error('Rollback error:', rErr); }
    }
    res.writeHead(500);
    return res.end(JSON.stringify({ error: 'Failed to register user', details: err.message }));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
}

// Login User
export async function handleLogin(req, res) {
  const { identifier, password } = req.body || {};

  if (!identifier || !password) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Username/Email/Phone and password are required' }));
  }

  let connection;
  try {
    connection = await getConnection();

    // Find user by username, email, or phone number
    const sql = `
      SELECT USER_ID, USERNAME, EMAIL, PHONE_NUMBER, PASSWORD_HASH, FULL_NAME, ACCOUNT_STATUS
      FROM USERS
      WHERE USERNAME = :identifier OR EMAIL = :identifier OR PHONE_NUMBER = :identifier
    `;

    const result = await connection.execute(sql, { identifier }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    if (!result.rows || result.rows.length === 0) {
      res.writeHead(401);
      return res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }

    const user = result.rows[0];

    // Check account status
    if (user.ACCOUNT_STATUS !== 'ACTIVE') {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Account is deactivated or suspended' }));
    }

    // Verify Password
    const isPasswordValid = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!isPasswordValid) {
      res.writeHead(401);
      return res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }

    // Generate JWT Token
    const token = generateToken({
      userId: user.USER_ID,
      username: user.USERNAME
    });

    // Update Last Login / Online Timestamp in DB
    const updateLastSeenSql = `UPDATE USERS SET LAST_SEEN = CURRENT_TIMESTAMP WHERE USER_ID = :userId`;
    await connection.execute(updateLastSeenSql, { userId: user.USER_ID });
    await connection.commit();

    res.writeHead(200);
    return res.end(JSON.stringify({
      message: 'Login successful',
      token,
      user: {
        userId: user.USER_ID,
        username: user.USERNAME,
        email: user.EMAIL,
        phoneNumber: user.PHONE_NUMBER,
        fullName: user.FULL_NAME
      }
    }));

  } catch (err) {
    console.error('Login Error:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) { console.error('Rollback error:', rErr); }
    }
    res.writeHead(500);
    return res.end(JSON.stringify({ error: 'Failed to process login' }));
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) { console.error('Connection close error:', err); }
    }
  }
}