import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Get Current User Profile
export async function handleGetProfile(req, res) {
  const userId = req.user?.userId;

  if (!userId) {
    res.writeHead(401);
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  let connection;
  try {
    connection = await getConnection();

    const sql = `
      SELECT USER_ID, USERNAME, EMAIL, PHONE_NUMBER, FULL_NAME, PROFILE_PICTURE, BIO, ACCOUNT_STATUS, CREATED_AT, LAST_SEEN
      FROM USERS
      WHERE USER_ID = :userId
    `;

    const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    if (!result.rows || result.rows.length === 0) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'User not found' }));
    }

    const user = result.rows[0];

    const formatDate = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val) : d.toISOString();
    };

    res.writeHead(200);
    return res.end(JSON.stringify({
      user: {
        userId: user.USER_ID,
        username: user.USERNAME,
        email: user.EMAIL,
        phoneNumber: user.PHONE_NUMBER,
        fullName: user.FULL_NAME,
        profilePicture: user.PROFILE_PICTURE || null,
        bio: user.BIO || null,
        accountStatus: user.ACCOUNT_STATUS,
        createdAt: formatDate(user.CREATED_AT),
        lastSeen: formatDate(user.LAST_SEEN)
      }
    }));

  } catch (err) {
    console.error('Get Profile Error:', err);
    res.writeHead(500);
    return res.end(JSON.stringify({ error: 'Failed to retrieve profile', details: err.message }));
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) { console.error('Connection close error:', err); }
    }
  }
}

// Update Current User Profile
export async function handleUpdateProfile(req, res) {
  const userId = req.user?.userId;
  const { fullName, bio, profilePicture } = req.body || {};

  if (!userId) {
    res.writeHead(401);
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  let connection;
  try {
    connection = await getConnection();

    const sql = `
      UPDATE USERS
      SET FULL_NAME = COALESCE(:fullName, FULL_NAME),
          BIO = COALESCE(:bio, BIO),
          PROFILE_PICTURE = COALESCE(:profilePicture, PROFILE_PICTURE)
      WHERE USER_ID = :userId
    `;

    const result = await connection.execute(
      sql,
      {
        fullName: fullName || null,
        bio: bio || null,
        profilePicture: profilePicture || null,
        userId
      }
    );

    await connection.commit();

    if (result.rowsAffected === 0) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'User not found or no changes made' }));
    }

    res.writeHead(200);
    return res.end(JSON.stringify({ message: 'Profile updated successfully' }));

  } catch (err) {
    console.error('Update Profile Error:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) { console.error('Rollback error:', rErr); }
    }
    res.writeHead(500);
    return res.end(JSON.stringify({ error: 'Failed to update profile', details: err.message }));
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) { console.error('Connection close error:', err); }
    }
  }
}