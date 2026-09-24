import oracledb from "oracledb";
import { getConnection } from "../config/database.js";
import { getIO } from "../socket/socket.js";

// Send a new message & update CHAT.LAST_MESSAGE_ID + Emit Socket Event
export async function handleSendMessage(req, res) {
  const senderId = req.user?.userId;
  const {
    chatId,
    messageText = null,
    messageType = "TEXT",
    replyTo = null,
    attachments = [],
  } = req.body || {};

  if (!chatId) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "chatId is required" }));
    }
    return;
  }

  // Ensure message contains either text or at least one attachment
  if (!messageText && (!attachments || attachments.length === 0)) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(
        JSON.stringify({
          error: "Message must contain either text or an attachment",
        }),
      );
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
    const memberResult = await connection.execute(memberCheckSql, {
      chatId,
      senderId,
    });

    if (memberResult.rows.length === 0) {
      if (!res.headersSent) {
        res.writeHead(403);
        return res
          .end(JSON.stringify({ error: "You are not a member of this chat" }));
      }
      return;
    }

    // Fetch Sender Info for the broadcast payload
    const senderSql = `
      SELECT USERNAME, FULL_NAME, PROFILE_PICTURE_URL 
      FROM USERS WHERE USER_ID = :senderId
    `;
    const senderResult = await connection.execute(
      senderSql,
      { senderId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const senderInfo = senderResult.rows[0] || {};

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
      messageId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
    };

    const messageResult = await connection.execute(
      insertMessageSql,
      messageBindVars,
    );
    const newMessageId = messageResult.outBinds.messageId[0];

    // 3. Insert Attachments if provided
    const insertedAttachments = [];
    if (attachments && attachments.length > 0) {
      const insertAttachmentSql = `
        INSERT INTO ATTACHMENT (MESSAGE_ID, FILE_NAME, FILE_PATH, FILE_TYPE, FILE_SIZE)
        VALUES (:messageId, :fileName, :filePath, :fileType, :fileSize)
        RETURNING ATTACHMENT_ID INTO :attId
      `;

      for (const att of attachments) {
        const filePath = att.url || att.filePath;
        const attBindVars = {
          messageId: newMessageId,
          fileName: att.fileName || null,
          filePath: filePath,
          fileType: att.fileType || null,
          fileSize: att.fileSize || null,
          attId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        };
        const attRes = await connection.execute(
          insertAttachmentSql,
          attBindVars,
        );
        insertedAttachments.push({
          ATTACHMENT_ID: attRes.outBinds.attId[0],
          MESSAGE_ID: newMessageId,
          FILE_NAME: att.fileName || null,
          URL: filePath,
          FILE_TYPE: att.fileType || null,
          FILE_SIZE: att.fileSize || null,
        });
      }
    }

    // 4. Update LAST_MESSAGE_ID in CHAT table
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

    const sentAt = new Date().toISOString();

    const messagePayload = {
      MESSAGE_ID: newMessageId,
      CHAT_ID: Number(chatId),
      SENDER_ID: senderId,
      SENDER_USERNAME: senderInfo.USERNAME,
      SENDER_FULL_NAME: senderInfo.FULL_NAME,
      SENDER_PROFILE_PICTURE: senderInfo.PROFILE_PICTURE_URL,
      MESSAGE_TEXT: messageText,
      MESSAGE_TYPE: messageType,
      REPLY_TO: replyTo,
      IS_EDITED: "N",
      SENT_AT: sentAt,
      ATTACHMENTS: insertedAttachments,
    };

    // 6. Broadcast message via Socket.IO to the room
    try {
      const io = getIO();
      io.to(`chat_${chatId}`).emit("receive_message", messagePayload);
    } catch (socketErr) {
      console.warn("Socket broadcast warning:", socketErr.message);
    }

    if (!res.headersSent) {
      res.writeHead(201);
      return res.end(
        JSON.stringify({
          message: "Message sent successfully",
          data: messagePayload,
        }),
      );
    }
  } catch (err) {
    console.error("Send Message Error:", err);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rErr) {}
    }
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: "Failed to send message" }));
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {}
    }
  }
}

// Fetch message history for a specific chat (Paginated with Attachments)
export async function handleGetMessages(req, res, chatId) {
  const userId = req.user?.userId;
  const parsedUrl = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`,
  );
  const limit = parseInt(parsedUrl.searchParams.get("limit")) || 50;
  const offset = parseInt(parsedUrl.searchParams.get("offset")) || 0;

  let connection;
  try {
    connection = await getConnection();

    // 1. Verify membership
    const memberCheckSql = `
      SELECT 1 FROM CHAT_MEMBER 
      WHERE CHAT_ID = :chatId AND USER_ID = :userId
    `;
    const memberResult = await connection.execute(memberCheckSql, {
      chatId,
      userId,
    });

    if (memberResult.rows.length === 0) {
      if (!res.headersSent) {
        res.writeHead(403);
        return res
          .end(
            JSON.stringify({ error: "Access denied to this chat history" }),
          );
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
        u.PROFILE_PICTURE_URL AS SENDER_PROFILE_PICTURE,
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
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const messages = messageResult.rows;

    // 3. Attach file details/URLs to relevant messages
    if (messages.length > 0) {
      const messageIds = messages.map((m) => m.MESSAGE_ID);

      const attachmentSql = `
        SELECT 
          ATTACHMENT_ID,
          MESSAGE_ID,
          FILE_NAME,
          FILE_PATH AS URL,
          FILE_TYPE,
          FILE_SIZE
        FROM ATTACHMENT
        WHERE MESSAGE_ID IN (${messageIds.map((_, i) => `:id${i}`).join(",")})
      `;

      const attachmentBinds = {};
      messageIds.forEach((id, index) => {
        attachmentBinds[`id${index}`] = id;
      });

      const attachmentResult = await connection.execute(
        attachmentSql,
        attachmentBinds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      // Group attachments by MESSAGE_ID
      const attachmentMap = {};
      attachmentResult.rows.forEach((att) => {
        if (!attachmentMap[att.MESSAGE_ID]) {
          attachmentMap[att.MESSAGE_ID] = [];
        }
        attachmentMap[att.MESSAGE_ID].push(att);
      });

      // Embed attachments into message objects
      messages.forEach((m) => {
        m.ATTACHMENTS = attachmentMap[m.MESSAGE_ID] || [];
      });
    }

    if (!res.headersSent) {
      res.writeHead(200);
      return res.end(
        JSON.stringify({
          chatId: Number(chatId),
          messages,
          limit,
          offset,
        }),
      );
    }
  } catch (err) {
    console.error("Fetch Messages Error:", err);
    if (!res.headersSent) {
      res.writeHead(500);
      return res
        .end(JSON.stringify({ error: "Failed to retrieve messages" }));
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {}
    }
  }
}