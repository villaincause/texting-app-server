import oracledb from 'oracledb';
import { getConnection } from '../config/database.js';

// Access or initiate a 1-on-1 DIRECT chat with a contact
export async function handleCreateOrGetDirectChat(req, res) {
  const userId = req.user?.userId || req.userId;
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
  const userId = req.user?.userId || req.userId;

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
        CASE 
          WHEN c.CHAT_TYPE = 'GROUP' THEN COALESCE(c.TITLE, 'Group Chat')
          ELSE COALESCE(cnt.SAVED_NAME, u.FULL_NAME, u.USERNAME, 'Unknown User')
        END AS CHAT_NAME
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

    // Map formatted rows so client frontends get intuitive camelCase & upper-case properties
    const formattedChats = (result.rows || []).map((row) => {
      const isGroup = row.CHAT_TYPE === 'GROUP';
      const resolvedName =
        row.CHAT_NAME ||
        row.TITLE ||
        row.OTHER_FULL_NAME ||
        row.OTHER_USERNAME ||
        (isGroup ? 'Group Chat' : 'Unknown');

      return {
        ...row,
        chatId: row.CHAT_ID,
        chatType: row.CHAT_TYPE,
        isGroup,
        name: resolvedName,
        title: resolvedName,
        chatName: resolvedName,
        DISPLAY_NAME: resolvedName,
        lastMessage: row.LAST_MESSAGE_TEXT || '',
        lastMessageTime: row.LAST_MESSAGE_SENT_AT || row.CREATED_AT,
        otherUser: !isGroup
          ? {
              userId: row.OTHER_USER_ID,
              username: row.OTHER_USERNAME,
              fullName: row.OTHER_FULL_NAME,
              profilePicture: row.OTHER_PROFILE_PICTURE || null,
              isOnline: Boolean(row.OTHER_IS_ONLINE),
              lastSeen: row.OTHER_LAST_SEEN
            }
          : null
      };
    });

    if (!res.headersSent) {
      res.writeHead(200);
      return res.end(JSON.stringify({ chats: formattedChats }));
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

// Get Group Members for a specified Chat ID
export async function handleGetGroupMembers(req, res, chatId) {
  if (!chatId) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'chatId is required' }));
    }
    return;
  }

  let connection;
  try {
    connection = await getConnection();

    const sql = `
      SELECT 
        u.USER_ID,
        u.USERNAME,
        u.FULL_NAME,
        u.PHONE_NUMBER,
        u.PROFILE_PICTURE,
        u.IS_ONLINE,
        u.LAST_SEEN,
        cm.ROLE,
        cm.JOINED_AT
      FROM CHAT_MEMBER cm
      JOIN USERS u ON cm.USER_ID = u.USER_ID
      WHERE cm.CHAT_ID = :chatId
      ORDER BY CASE WHEN cm.ROLE = 'ADMIN' THEN 1 ELSE 2 END, u.FULL_NAME ASC
    `;

    const result = await connection.execute(
      sql,
      { chatId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const members = result.rows.map((m) => ({
      userId: m.USER_ID,
      username: m.USERNAME,
      fullName: m.FULL_NAME,
      phoneNumber: m.PHONE_NUMBER,
      profilePicture: m.PROFILE_PICTURE || null,
      isOnline: Boolean(m.IS_ONLINE),
      role: m.ROLE,
      joinedAt: m.JOINED_AT
    }));

    if (!res.headersSent) {
      res.writeHead(200);
      return res.end(JSON.stringify({ members }));
    }
  } catch (err) {
    console.error('Get Group Members Error:', err);
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Failed to fetch group members' }));
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
}

// Add Member(s) to a Group Chat (supports single targetUserId or memberIds array)
export async function handleAddGroupMember(req, res, chatId) {
  const currentUserId = req.user?.userId || req.userId;
  const { targetUserId, memberIds, role } = req.body || {};

  // Extract array or single ID
  const targetIds = memberIds && Array.isArray(memberIds)
    ? memberIds
    : targetUserId
    ? [targetUserId]
    : [];

  if (!chatId || targetIds.length === 0) {
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'chatId and targetUserId (or memberIds) are required' }));
    }
    return;
  }

  let connection;
  try {
    connection = await getConnection();

    // 1. Verify that the requesting user is a member of this chat
    const checkAuthSql = `
      SELECT ROLE 
      FROM CHAT_MEMBER 
      WHERE CHAT_ID = :chatId AND USER_ID = :currentUserId
    `;
    const authResult = await connection.execute(
      checkAuthSql,
      { chatId, currentUserId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!authResult.rows || authResult.rows.length === 0) {
      if (!res.headersSent) {
        res.writeHead(403);
        return res.end(JSON.stringify({ error: 'Not authorized to modify this chat' }));
      }
      return;
    }

    // 2. Insert new member(s) safely ignoring already added users
    const insertSql = `
      INSERT INTO CHAT_MEMBER (CHAT_ID, USER_ID, ROLE, JOINED_AT)
      SELECT :chatId, :targetUserId, :role, SYSDATE
      FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 
        FROM CHAT_MEMBER 
        WHERE CHAT_ID = :chatId AND USER_ID = :targetUserId
      )
    `;

    let totalInserted = 0;
    const assignedRole = role || 'MEMBER';

    for (const uid of targetIds) {
      const result = await connection.execute(insertSql, {
        chatId,
        targetUserId: uid,
        role: assignedRole
      });
      totalInserted += result.rowsAffected;
    }

    await connection.commit();

    if (totalInserted === 0) {
      if (!res.headersSent) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Selected user(s) are already members of this chat' }));
      }
      return;
    }

    if (!res.headersSent) {
      res.writeHead(201);
      return res.end(JSON.stringify({ message: `${totalInserted} member(s) added successfully` }));
    }
  } catch (err) {
    console.error('Add Group Member Error:', err);
    if (connection) {
      try { await connection.rollback(); } catch (rErr) {}
    }
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Failed to add member(s) to group' }));
    }
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
}