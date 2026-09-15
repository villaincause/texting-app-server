import oracledb from "oracledb";
import { getConnection } from "../config/database.js";

// Normalize phone number to a consistent format
function normalizePhone(phone) {
  if (!phone) return "";

  let normalized = String(phone)
    .trim()
    .replace(/[^\d+]/g, "");

  // Convert 00XXXXXXXX -> +XXXXXXXX
  normalized = normalized.replace(/^00/, "+");

  return normalized;
}

// Get user's contacts list
export async function handleGetContacts(req, res) {
  const userId = req.user?.userId;

  let connection;

  try {
    connection = await getConnection();

    const sql = `
      SELECT 
        c.CONTACT_ID,
        c.SAVED_NAME,
        u.USER_ID AS CONTACT_USER_ID,
        u.USERNAME,
        u.PHONE_NUMBER,
        u.PROFILE_PICTURE,
        u.BIO,
        u.IS_ONLINE,
        u.LAST_SEEN
      FROM CONTACTS c
      JOIN USERS u 
        ON c.CONTACT_USER_ID = u.USER_ID
      WHERE c.USER_ID = :userId
      ORDER BY NVL(c.SAVED_NAME, u.USERNAME) ASC
    `;

    const result = await connection.execute(
      sql,
      { userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    if (!res.headersSent) {
      res.writeHead(200);
      return res.end(
        JSON.stringify({
          contacts: result.rows,
        }),
      );
    }
  } catch (err) {
    console.error("Get Contacts Error:", err);

    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(
        JSON.stringify({
          error: "Failed to fetch contacts",
        }),
      );
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {}
    }
  }
}

// Sync phone contacts from mobile device
export async function handleSyncContacts(req, res) {
  const userId = req.user?.userId;
  const { phoneNumbers } = req.body || {};

  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(
        JSON.stringify({
          error: "No phone numbers provided",
        }),
      );
    }

    return;
  }

  let connection;

  try {
    connection = await getConnection();

    const insertSql = `
      INSERT INTO CONTACTS (
        USER_ID,
        CONTACT_USER_ID,
        SAVED_NAME
      )
      SELECT
        :userId,
        u.USER_ID,
        :savedName
      FROM USERS u
      WHERE u.PHONE_NUMBER = :phoneNumber
        AND u.USER_ID != :userId
        AND NOT EXISTS (
          SELECT 1
          FROM CONTACTS
          WHERE USER_ID = :userId
            AND CONTACT_USER_ID = u.USER_ID
        )
    `;

    let syncedCount = 0;

    for (const item of phoneNumbers) {
      if (!item?.phoneNumber) continue;

      const normalizedPhone = normalizePhone(item.phoneNumber);

      if (!normalizedPhone) continue;

      const result = await connection.execute(insertSql, {
        userId,
        phoneNumber: normalizedPhone,
        savedName: item.savedName || null,
      });

      syncedCount += result.rowsAffected;
    }

    await connection.commit();

    if (!res.headersSent) {
      res.writeHead(200);

      return res.end(
        JSON.stringify({
          message: "Sync complete",
          syncedCount,
        }),
      );
    }
  } catch (err) {
    console.error("Sync Error:", err);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rErr) {}
    }

    if (!res.headersSent) {
      res.writeHead(500);

      return res.end(
        JSON.stringify({
          error: "Failed to sync contacts",
          details: err.message,
        }),
      );
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {}
    }
  }
}
