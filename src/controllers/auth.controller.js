import bcrypt from "bcrypt";
import oracledb from "oracledb";
import { getConnection } from "../config/database.js";
import { generateOTP, verifyOTP } from "../services/otp.service.js";
import { generateToken } from "../utils/jwt.js";
import { config } from "../config/env.js";

// Constants

const OTP_PURPOSES = Object.freeze({
  LOGIN: "LOGIN",
  REGISTRATION: "REGISTRATION",
});

const PHONE_REGEX = /^\+8801[3-9]\d{8}$/;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify(payload));
}

function normalizePhoneNumber(phoneNumber) {
  return typeof phoneNumber === "string"
    ? phoneNumber.replace(/\s/g, "").trim()
    : phoneNumber;
}

// Utility Functions

function isValidOtpPurpose(purpose) {
  return Object.values(OTP_PURPOSES).includes(purpose);
}

function isValidPhoneNumber(phoneNumber) {
  return typeof phoneNumber === "string" && PHONE_REGEX.test(phoneNumber);
}

async function findUserByPhoneNumber(phoneNumber) {
  const connection = await getConnection();

  try {
    const result = await connection.execute(
      `
        SELECT USER_ID
        FROM USERS
        WHERE PHONE_NUMBER = :phoneNumber
      `,
      {
        phoneNumber,
      },
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    try {
      await connection.close();
    } catch (closeErr) {
      console.error("Failed to close DB connection:", closeErr);
    }
  }
}

// Controller Functions

export async function handleCheckPhone(req, res) {
  const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);

  if (!isValidPhoneNumber(phoneNumber)) {
    return sendJson(res, 400, {
      error: "A valid Bangladesh phone number is required",
    });
  }

  try {
    const user = await findUserByPhoneNumber(phoneNumber);

    return sendJson(res, 200, {
      exists: Boolean(user),
    });
  } catch (err) {
    console.error("Check Phone Error:", err);

    return sendJson(res, 500, {
      error: "Failed to check phone number",
    });
  }
}

export async function handleSendOtp(req, res) {
  const purpose = req.body?.purpose;
  const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);

  if (!isValidPhoneNumber(phoneNumber)) {
    return sendJson(res, 400, {
      error: "A valid Bangladesh phone number is required",
    });
  }

  if (!isValidOtpPurpose(purpose)) {
    return sendJson(res, 400, {
      error: "Invalid OTP purpose",
    });
  }

  try {
    const user = await findUserByPhoneNumber(phoneNumber);
    const userExists = Boolean(user);

    if (purpose === OTP_PURPOSES.LOGIN) {
      if (!userExists) {
        return sendJson(res, 200, {
          exists: false,
        });
      }

      await generateOTP(phoneNumber, OTP_PURPOSES.LOGIN);

      return sendJson(res, 200, {
        exists: true,
        message: "OTP sent successfully",
      });
    }

    if (purpose === OTP_PURPOSES.REGISTRATION) {
      if (userExists) {
        return sendJson(res, 409, {
          error: "An account already exists with this phone number",
        });
      }

      await generateOTP(phoneNumber, OTP_PURPOSES.REGISTRATION);

      return sendJson(res, 200, {
        message: "OTP sent successfully",
      });
    }
  } catch (err) {
    console.error("Send OTP Error:", err);

    return sendJson(res, 500, {
      error: "Failed to process phone number",
    });
  }
}

export async function handleCheckUsername(req, res) {
  try {
    const body = req.body || {};
    const username = body.username?.trim().toLowerCase();

    if (!username) {
      return sendJson(res, 400, {
        message: "Username is required",
      });
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return sendJson(res, 400, {
        message:
          "Username must be 3–20 characters and can only contain letters, numbers, and underscores.",
      });
    }

    const connection = await getConnection();

    try {
      const result = await connection.execute(
        `
          SELECT USER_ID
          FROM USERS
          WHERE LOWER(USERNAME) = :username
            AND ACCOUNT_STATUS != 'DELETED'
        `,
        {
          username,
        },
      );

      return sendJson(res, 200, {
        available: result.rows.length === 0,
      });
    } finally {
      await connection.close();
    }
  } catch (error) {
    console.error("Check username error:", error);

    return sendJson(res, 500, {
      message: "Unable to check username",
    });
  }
}

export async function handleVerifyOtp(req, res) {
  const purpose = req.body?.purpose;
  const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);

  const otp =
    typeof req.body?.otp === "string" ? req.body.otp.trim() : req.body?.otp;

  if (!isValidPhoneNumber(phoneNumber)) {
    return sendJson(res, 400, {
      error: "A valid Bangladesh phone number is required",
    });
  }

  if (!otp) {
    return sendJson(res, 400, {
      error: "OTP is required",
    });
  }

  if (!isValidOtpPurpose(purpose)) {
    return sendJson(res, 400, {
      error: "Invalid OTP purpose",
    });
  }

  try {
    const isValid = await verifyOTP(phoneNumber, otp, purpose);

    if (!isValid) {
      return sendJson(res, 400, {
        error: "Invalid or expired OTP",
      });
    }

    return sendJson(res, 200, {
      message: "OTP verified successfully",
      purpose,
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);

    return sendJson(res, 500, {
      error: "Failed to verify OTP",
    });
  }
}

export async function handleRegister(req, res) {
  const {
    username: rawUsername,
    email,
    phoneNumber: rawPhoneNumber,
    password,
    fullName,
    otp,
    profilePicture: rawProfilePicture,
  } = req.body || {};

  const username =
    typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";

  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);

  const profilePicture =
    typeof rawProfilePicture === "string" ? rawProfilePicture.trim() : null;

  // Required fields
  if (!username || !phoneNumber || !password || !otp) {
    return sendJson(res, 400, {
      error: "Username, phone number, password, and OTP are required",
    });
  }

  // Validate username
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return sendJson(res, 400, {
      error:
        "Username must be 4-20 characters and can only contain letters, numbers, and underscores.",
    });
  }

  // Validate phone number
  if (!isValidPhoneNumber(phoneNumber)) {
    return sendJson(res, 400, {
      error: "A valid Bangladesh phone number is required",
    });
  }

  // Validate password length
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 20
  ) {
    return sendJson(res, 400, {
      error: "Password must be between 8 and 20 characters",
    });
  }

  // Validate Cloudinary profile picture URL, if supplied
  if (profilePicture) {
    try {
      const imageUrl = new URL(profilePicture);
      const cloudName = config.CLOUDINARY_CLOUD_NAME;

      const expectedPathPrefix = `/${cloudName}/image/upload/`;

      const isValidCloudinaryUrl =
        imageUrl.protocol === "https:" &&
        imageUrl.hostname === "res.cloudinary.com" &&
        imageUrl.pathname.startsWith(expectedPathPrefix) &&
        imageUrl.pathname.includes("/texting-app/");

      if (!isValidCloudinaryUrl) {
        return sendJson(res, 400, {
          error:
            "A valid profile picture URL from your Cloudinary account is required",
        });
      }
    } catch {
      return sendJson(res, 400, {
        error: "Invalid profile picture URL",
      });
    }
  }

  let connection;

  try {
    // Verify registration OTP
    const isValidOtp = await verifyOTP(
      phoneNumber,
      otp,
      OTP_PURPOSES.REGISTRATION,
    );

    if (!isValidOtp) {
      return sendJson(res, 400, {
        error: "Invalid or expired OTP",
      });
    }

    connection = await getConnection();

    // Check for existing username or phone number
    const checkSql = `
      SELECT USERNAME, PHONE_NUMBER
      FROM USERS
      WHERE LOWER(USERNAME) = :username
         OR PHONE_NUMBER = :phoneNumber
    `;

    const checkResult = await connection.execute(
      checkSql,
      {
        username,
        phoneNumber,
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      },
    );

    if (checkResult.rows && checkResult.rows.length > 0) {
      return sendJson(res, 409, {
        error: "Username or phone number already registered",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user, including the Cloudinary profile picture URL
    const insertSql = `
      INSERT INTO USERS (
        USERNAME,
        EMAIL,
        PHONE_NUMBER,
        PASSWORD_HASH,
        FULL_NAME,
        PROFILE_PICTURE
      )
      VALUES (
        :username,
        :email,
        :phoneNumber,
        :passwordHash,
        :fullName,
        :profilePicture
      )
      RETURNING USER_ID INTO :userId
    `;

    const result = await connection.execute(insertSql, {
      username,
      email: email || null,
      phoneNumber,
      passwordHash,
      fullName: fullName || null,
      profilePicture: profilePicture || null,
      userId: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    });

    const newUserId = result.outBinds.userId[0];

    // Generate authentication token
    const token = generateToken({
      userId: newUserId,
      username,
    });

    // Update last seen
    await connection.execute(
      `
        UPDATE USERS
        SET LAST_SEEN = CURRENT_TIMESTAMP
        WHERE USER_ID = :userId
      `,
      {
        userId: newUserId,
      },
    );

    await connection.commit();

    return sendJson(res, 201, {
      message: "User registered successfully",
      token,
      user: {
        userId: newUserId,
        username,
        email: email || null,
        phoneNumber,
        fullName: fullName || null,
        profilePicture: profilePicture || null,
      },
    });
  } catch (err) {
    console.error("Registration Error:", err);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }

    return sendJson(res, 500, {
      error: "Failed to register user",
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error("Connection close error:", closeErr);
      }
    }
  }
}

export async function handleLogin(req, res) {
  const { identifier, password, otp } = req.body || {};

  if (!identifier || !password || !otp) {
    return sendJson(res, 400, {
      error: "Username/Email/Phone, password, and OTP are required",
    });
  }

  let connection;

  try {
    connection = await getConnection();

    const sql = `
      SELECT
        USER_ID,
        USERNAME,
        EMAIL,
        PHONE_NUMBER,
        PASSWORD_HASH,
        FULL_NAME,
        ACCOUNT_STATUS
      FROM USERS
      WHERE USERNAME = :identifier
      OR EMAIL = :identifier
      OR PHONE_NUMBER = :identifier
    `;

    const result = await connection.execute(
      sql,
      {
        identifier,
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      },
    );

    if (!result.rows || result.rows.length === 0) {
      return sendJson(res, 401, {
        error: "Invalid credentials",
      });
    }

    const user = result.rows[0];

    if (user.ACCOUNT_STATUS !== "ACTIVE") {
      return sendJson(res, 403, {
        error: "Account is deactivated or suspended",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.PASSWORD_HASH);

    if (!isPasswordValid) {
      return sendJson(res, 401, {
        error: "Invalid credentials",
      });
    }

    const isOtpValid = await verifyOTP(
      user.PHONE_NUMBER,
      otp,
      OTP_PURPOSES.LOGIN,
    );

    if (!isOtpValid) {
      return sendJson(res, 401, {
        error: "Invalid or expired OTP",
      });
    }

    const token = generateToken({
      userId: user.USER_ID,
      username: user.USERNAME,
    });

    await connection.execute(
      `
        UPDATE USERS
        SET LAST_SEEN = CURRENT_TIMESTAMP
        WHERE USER_ID = :userId
      `,
      {
        userId: user.USER_ID,
      },
    );

    await connection.commit();

    return sendJson(res, 200, {
      message: "Login successful",
      token,
      user: {
        userId: user.USER_ID,
        username: user.USERNAME,
        email: user.EMAIL,
        phoneNumber: user.PHONE_NUMBER,
        fullName: user.FULL_NAME,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }

    return sendJson(res, 500, {
      error: "Failed to process login",
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error("Connection close error:", closeErr);
      }
    }
  }
}
