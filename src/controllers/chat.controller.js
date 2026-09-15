import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Access or initiate a 1-on-1 DIRECT chat with a contact
export async function handleCreateOrGetDirectChat(req, res) {
  const userId = req.user?.userId;
  const { recipientId } = req.body || {};

  if (!recipientId) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'recipientId is required' }));
    }
    return;
  }

  if (Number(userId) === Number(recipientId)) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Cannot create a direct chat with yourself' }));
    }
    return;
  }

  let connection;
  try {
    connection = await getConnection();

    // 1. Check if a DIRECT chat already exists between these two users
    const findExistingSql = `
      SELECT cm1.CHAT_ID
      FROM CHAT_MEMBER cm1
      JOIN CHAT_MEMBER cm2 ON cm1.CHAT_ID = cm2.CHAT_ID
      JOIN CHAT c ON cm1.CHAT_ID = c.CHAT_ID
      WHERE cm1.USER_ID = :userId
        AND cm2.USER_ID = :recipientId
        AND c.CHAT_TYPE = 'DIRECT'
    `;

    const existingResult = await connection.execute(
      findExistingSql,
      { userId, recipientId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existingResult.rows.length > 0) {
      const chatId = existingResult.rows[0].CHAT_ID;
      if (!res.headersSent) {
        res.writeHead(200);
        return res.end(JSON.stringify({ chatId, isNew: false }));
      }
      return;
    }

    // 2. If no chat exists, create a new DIRECT chat entry
    const createChatSql = `
      INSERT INTO CHAT (CHAT_TYPE)
      VALUES ('DIRECT')
      RETURNING CHAT_ID INTO :chatId
    `;

    const chatBindVars = {
      chatId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    };

    const chatResult = await connection.execute(createChatSql, chatBindVars);
    const newChatId = chatResult.outBinds.chatId[0];

    // 3. Add both users to CHAT_MEMBER table
    const addMemberSql = `
      INSERT INTO CHAT_MEMBER (CHAT_ID, USER_ID, ROLE)
      VALUES (:chatId, :memberUserId, 'MEMBER')
    `;

    await connection.execute(addMemberSql, { chatId: newChatId, memberUserId: userId });
    await connection.execute(addMemberSql, { chatId: newChatId, memberUserId: recipientId });

    await connection.commit();

    if (!res.headersSent) {
      res.writeHead(201);
      return res.end(JSON.stringify({ chatId: newChatId, isNew: true }));
    }
  } catch (err) {
    console.error('Create Chat Error:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) {}
    }
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Failed to create or retrieve chat session' }));
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
}

// Get all active chats for the logged-in user with latest message preview
export async function handleGetUserChats(req, res) {
  const userId = req.user?.userId;

  let connection;
  try {
    connection = await getConnection();

    const sql = `
      SELECT 
        c.CHAT_ID,
        c.CHAT_TYPE,
        c.TITLE,
        c.CREATED_AT,
        m.MESSAGE_ID AS LAST_MESSAGE_ID,
        m.MESSAGE_TEXT AS LAST_MESSAGE_TEXT,
        m.MESSAGE_TYPE AS LAST_MESSAGE_TYPE,
        m.SENT_AT AS LAST_MESSAGE_SENT_AT,
        m.SENDER_ID AS LAST_MESSAGE_SENDER_ID,
        u.USER_ID AS OTHER_USER_ID,
        u.USERNAME AS OTHER_USERNAME,
        u.FULL_NAME AS OTHER_FULL_NAME,
        u.PROFILE_PICTURE AS OTHER_PROFILE_PICTURE,
        u.IS_ONLINE AS OTHER_IS_ONLINE,
        u.LAST_SEEN AS OTHER_LAST_SEEN,
        NVL(cnt.SAVED_NAME, u.FULL_NAME) AS DISPLAY_NAME
      FROM CHAT c
      JOIN CHAT_MEMBER cm ON c.CHAT_ID = cm.CHAT_ID
      LEFT JOIN MESSAGE m ON c.LAST_MESSAGE_ID = m.MESSAGE_ID
      LEFT JOIN CHAT_MEMBER cm2 ON c.CHAT_ID = cm2.CHAT_ID AND cm2.USER_ID != :userId AND c.CHAT_TYPE = 'DIRECT'
      LEFT JOIN USERS u ON cm2.USER_ID = u.USER_ID
      LEFT JOIN CONTACTS cnt ON cnt.USER_ID = :userId AND cnt.CONTACT_USER_ID = u.USER_ID
      WHERE cm.USER_ID = :userId
      ORDER BY NVL(m.SENT_AT, c.CREATED_AT) DESC
    `;

    const result = await connection.execute(
      sql,
      { userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!res.headersSent) {
      res.writeHead(200);
      return res.end(JSON.stringify({ chats: result.rows }));
    }
  } catch (err) {
    console.error('Fetch Chats Error:', err);
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Failed to fetch user chats' }));
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
}