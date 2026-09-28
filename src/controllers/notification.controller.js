import { getConnection } from '../config/database.js';

const sendResponse = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

// Fetch user notifications
export const getUserNotifications = async (req, res, userId) => {
  let conn;
  try {
    conn = await getConnection();
    
    // Fix: Table name is NOTIFICATION (Singular)
    const result = await conn.execute(
      `SELECT NOTIFICATION_ID, TYPE, TITLE, BODY, CHAT_ID, ASSIGNMENT_ID, IS_READ, CREATED_AT
       FROM NOTIFICATION
       WHERE USER_ID = :userId
       ORDER BY CREATED_AT DESC`,
      [userId]
    );

    const notifications = (result.rows || []).map(row => {
      const notifId = row.NOTIFICATION_ID ?? row[0];
      const type = row.TYPE ?? row[1];
      const title = row.TITLE ?? row[2];
      const body = row.BODY ?? row[3];
      const chatId = row.CHAT_ID ?? row[4];
      const assignmentId = row.ASSIGNMENT_ID ?? row[5];
      const isRead = row.IS_READ ?? row[6];
      const createdAt = row.CREATED_AT ?? row[7];

      return {
        notificationId: notifId,
        type,
        title,
        body,
        chatId,
        assignmentId,
        isRead,
        createdAt,
        navigation: {
          target: assignmentId ? 'ASSIGNMENT_SUBMISSION_SCREEN' : 'CHAT_SCREEN',
          chatId,
          assignmentId
        }
      };
    });

    return sendResponse(res, 200, { notifications });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};

// Set Mute Duration for a Chat
export const setChatMute = async (req, res, body, userId, chatId) => {
  const { muteOption } = body; // '15m', '1h', '2h', '6h', 'off', 'unmute'

  let mutedUntil = null;
  const now = new Date();

  if (muteOption === '15m') mutedUntil = new Date(now.getTime() + 15 * 60000);
  else if (muteOption === '1h') mutedUntil = new Date(now.getTime() + 60 * 60000);
  else if (muteOption === '2h') mutedUntil = new Date(now.getTime() + 120 * 60000);
  else if (muteOption === '6h') mutedUntil = new Date(now.getTime() + 360 * 60000);
  else if (muteOption === 'off') mutedUntil = new Date('2099-12-31T23:59:59Z'); // Indefinite
  else if (muteOption === 'unmute') mutedUntil = null;
  else return sendResponse(res, 400, { error: 'Invalid muteOption' });

  let conn;
  try {
    conn = await getConnection();

    if (mutedUntil === null) {
      // Unmute
      await conn.execute(
        `DELETE FROM CHAT_MUTE_PREFERENCES WHERE USER_ID = :userId AND CHAT_ID = :chatId`,
        { userId, chatId },
        { autoCommit: true }
      );
      return sendResponse(res, 200, { message: 'Chat unmuted successfully' });
    }

    // Merge/Upsert Mute Record
    await conn.execute(
      `MERGE INTO CHAT_MUTE_PREFERENCES target
       USING (SELECT :userId AS u_id, :chatId AS c_id FROM DUAL) src
       ON (target.USER_ID = src.u_id AND target.CHAT_ID = src.c_id)
       WHEN MATCHED THEN 
         UPDATE SET MUTED_UNTIL = :mutedUntil
       WHEN NOT MATCHED THEN 
         INSERT (USER_ID, CHAT_ID, MUTED_UNTIL) VALUES (:userId, :chatId, :mutedUntil)`,
      { userId, chatId, mutedUntil },
      { autoCommit: true }
    );

    return sendResponse(res, 200, { message: 'Chat muted successfully', mutedUntil });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message });
  } finally {
    if (conn) await conn.close();
  }
};