import bcrypt from 'bcrypt';
import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';
import { generateOTP, verifyOTP } from '../services/otp.service.js';

// Send / Generate OTP
export async function handleSendOtp(req, res) {
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Phone number is required' }));
  }

  const otp = generateOTP(phoneNumber);
  
  res.writeHead(200);
  res.end(JSON.stringify({ message: 'OTP sent successfully', otp })); 
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
    res.end(JSON.stringify({ 
      message: 'User registered successfully', 
      userId: newUserId 
    }));

  } catch (err) {
    console.error('Registration Error Details:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) { console.error('Rollback error:', rErr); }
    }
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to register user', details: err.message }));
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