import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Send a new message & update CHAT.LAST_MESSAGE_ID
export async function handleSendMessage(req, res) {
  const senderId = req.user?.userId;
  const { chatId, messageText = null, messageType = 'TEXT', replyTo = null, attachments = [] } = req.body || {};

  if (!chatId) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'chatId is required' }));
    }
    return;
  }

  // Ensure message contains either text or at least one attachment
  if (!messageText && (!attachments || attachments.length === 0)) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Message must contain either text or an attachment' }));
    }
    return;
  }

  let connection;
  try {
    connection = await getConnection();

    // 1. Verify user is a member of the chat
    const memberCheckSql = `
      SELECT 1 FROM CHAT_MEMBER 
      WHERE CHAT_ID = :chatId AND USER_ID = :senderId
    `;
    const memberResult = await connection.execute(memberCheckSql, { chatId, senderId });

    if (memberResult.rows.length === 0) {
      if (!res.headersSent) {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: 'You are not a member of this chat' }));
      }
      return;
    }

    // 2. Insert Message
    const insertMessageSql = `
      INSERT INTO MESSAGE (CHAT_ID, SENDER_ID, MESSAGE_TEXT, MESSAGE_TYPE, REPLY_TO)
      VALUES (:chatId, :senderId, :messageText, :messageType, :replyTo)
      RETURNING MESSAGE_ID INTO :messageId
    `;

    const messageBindVars = {
      chatId,
      senderId,
      messageText,
      messageType,
      replyTo,
      messageId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    };

    const messageResult = await connection.execute(insertMessageSql, messageBindVars);
    const newMessageId = messageResult.outBinds.messageId[0];

    // 3. Insert Attachments if provided (storing attachment URL in FILE_PATH)
    if (attachments && attachments.length > 0) {
      const insertAttachmentSql = `
        INSERT INTO ATTACHMENT (MESSAGE_ID, FILE_NAME, FILE_PATH, FILE_TYPE, FILE_SIZE)
        VALUES (:messageId, :fileName, :filePath, :fileType, :fileSize)
      `;

      for (const att of attachments) {
        await connection.execute(insertAttachmentSql, {
          messageId: newMessageId,
          fileName: att.fileName || null,
          filePath: att.url || att.filePath, // Attachment URL
          fileType: att.fileType || null,
          fileSize: att.fileSize || null
        });
      }
    }

    // 4. Update LAST_MESSAGE_ID in CHAT table for instant list previews
    const updateChatSql = `
      UPDATE CHAT 
      SET LAST_MESSAGE_ID = :newMessageId 
      WHERE CHAT_ID = :chatId
    `;
    await connection.execute(updateChatSql, { newMessageId, chatId });

    // 5. Create Initial SENT status entry for sender
    const statusSql = `
      INSERT INTO MESSAGE_STATUS (MESSAGE_ID, USER_ID, STATUS)
      VALUES (:newMessageId, :senderId, 'SENT')
    `;
    await connection.execute(statusSql, { newMessageId, senderId });

    await connection.commit();

    if (!res.headersSent) {
      res.writeHead(201);
      return res.end(JSON.stringify({
        message: 'Message sent successfully',
        messageId: newMessageId,
        chatId,
        senderId,
        messageText,
        messageType,
        attachments,
        sentAt: new Date().toISOString()
      }));
    }
  } catch (err) {
    console.error('Send Message Error:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) {}
    }
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Failed to send message' }));
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
}

// Fetch message history for a specific chat (Paginated with Attachments)
export async function handleGetMessages(req, res, chatId) {
  const userId = req.user?.userId;
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const limit = parseInt(parsedUrl.searchParams.get('limit')) || 50;
  const offset = parseInt(parsedUrl.searchParams.get('offset')) || 0;

  let connection;
  try {
    connection = await getConnection();

    // 1. Verify membership
    const memberCheckSql = `
      SELECT 1 FROM CHAT_MEMBER 
      WHERE CHAT_ID = :chatId AND USER_ID = :userId
    `;
    const memberResult = await connection.execute(memberCheckSql, { chatId, userId });

    if (memberResult.rows.length === 0) {
      if (!res.headersSent) {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: 'Access denied to this chat history' }));
      }
      return;
    }

    // 2. Fetch Messages with Sender Details
    const messageSql = `
      SELECT 
        m.MESSAGE_ID,
        m.CHAT_ID,
        m.SENDER_ID,
        u.USERNAME AS SENDER_USERNAME,
        u.FULL_NAME AS SENDER_FULL_NAME,
        m.MESSAGE_TEXT,
        m.MESSAGE_TYPE,
        m.REPLY_TO,
        m.IS_EDITED,
        m.SENT_AT
      FROM MESSAGE m
      JOIN USERS u ON m.SENDER_ID = u.USER_ID
      WHERE m.CHAT_ID = :chatId AND m.DELETED_FOR_ALL = 'N'
      ORDER BY m.SENT_AT ASC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;

    const messageResult = await connection.execute(
      messageSql,
      { chatId, offset, limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const messages = messageResult.rows;

    // 3. Attach file details/URLs to relevant messages
    if (messages.length > 0) {
      const messageIds = messages.map(m => m.MESSAGE_ID);
      
      // Fetch attachments for retrieved messages
      const attachmentSql = `
        SELECT 
          ATTACHMENT_ID,
          MESSAGE_ID,
          FILE_NAME,
          FILE_PATH AS URL,
          FILE_TYPE,
          FILE_SIZE
        FROM ATTACHMENT
        WHERE MESSAGE_ID IN (${messageIds.map((_, i) => `:id${i}`).join(',')})
      `;

      const attachmentBinds = {};
      messageIds.forEach((id, index) => {
        attachmentBinds[`id${index}`] = id;
      });

      const attachmentResult = await connection.execute(
        attachmentSql,
        attachmentBinds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Group attachments by MESSAGE_ID
      const attachmentMap = {};
      attachmentResult.rows.forEach(att => {
        if (!attachmentMap[att.MESSAGE_ID]) {
          attachmentMap[att.MESSAGE_ID] = [];
        }
        attachmentMap[att.MESSAGE_ID].push(att);
      });

      // Embed attachments into message objects
      messages.forEach(m => {
        m.ATTACHMENTS = attachmentMap[m.MESSAGE_ID] || [];
      });
    }

    if (!res.headersSent) {
      res.writeHead(200);
      return res.end(JSON.stringify({
        chatId: Number(chatId),
        messages,
        limit,
        offset
      }));
    }
  } catch (err) {
    console.error('Fetch Messages Error:', err);
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Failed to retrieve messages' }));
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
}