import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Helper to check if a user muted a specific chat
export const isChatMuted = async (userId, chatId) => {
  if (!chatId) return false;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT MUTED_UNTIL 
       FROM CHAT_MUTE_PREFERENCES 
       WHERE USER_ID = :userId AND CHAT_ID = :chatId`,
      { userId, chatId }
    );

    if (!result.rows || result.rows.length === 0) return false;

    const row = result.rows[0];
    const mutedUntil = row.MUTED_UNTIL || row.muted_until || (Array.isArray(row) ? row[0] : null);

    if (!mutedUntil) return false;

    // Check if the mute expiration is still in the future
    return new Date(mutedUntil) > new Date();
  } catch (err) {
    console.error('Error checking mute status:', err);
    return false;
  } finally {
    if (conn) await conn.close();
  }
};

// Insert notification into Oracle DB and emit via Socket.io if recipient is online
export const createAndSendNotification = async (io, userSockets, {
  userId,
  type,
  title,
  body,
  chatId = null,
  assignmentId = null
}) => {
  let conn;
  try {
    conn = await getConnection();

    // Fix: Table name is NOTIFICATION (Singular)
    const result = await conn.execute(
      `INSERT INTO NOTIFICATION (USER_ID, TYPE, TITLE, BODY, CHAT_ID, ASSIGNMENT_ID)
       VALUES (:userId, :type, :title, :body, :chatId, :assignmentId)
       RETURNING NOTIFICATION_ID, CREATED_AT INTO :notifId, :createdAt`,
      {
        userId,
        type,
        title,
        body,
        chatId,
        assignmentId,
        notifId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        createdAt: { type: oracledb.DATE, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );

    const notificationId = result.outBinds.notifId[0];
    const createdAt = result.outBinds.createdAt[0];

    const notificationPayload = {
      notificationId,
      userId,
      type,
      title,
      body,
      chatId,
      assignmentId,
      isRead: 'N',
      createdAt,
      action: {
        screen: assignmentId ? 'SUBMISSION_SCREEN' : 'CHAT_SCREEN',
        targetId: assignmentId || chatId
      }
    };

    // Emit live event only if recipient hasn't muted the chat
    const muted = chatId ? await isChatMuted(userId, chatId) : false;
    
    if (!muted && userSockets) {
      const socketId = userSockets.get(Number(userId));
      if (socketId) {
        io.to(socketId).emit('notification:new', notificationPayload);
      }
    }

    return notificationPayload;
  } catch (err) {
    console.error('Failed to create notification:', err);
    throw err;
  } finally {
    if (conn) await conn.close();
  }
};