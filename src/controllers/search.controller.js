import { getConnection } from "../config/database.js";

/**
 * GET /api/search?q=query
 * Unified search for Contacts, Direct Chats, and Groups
 */
export const searchAll = async (req, res, userId) => {
  let connection;
  try {
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const query = (urlParams.searchParams.get("q") || "").trim();

    if (!query) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          contacts: [],
          directChats: [],
          groups: [],
        })
      );
    }

    connection = await getConnection();
    const searchPattern = `%${query.toLowerCase()}%`;

    // 1. Search Contacts (Uses CONTACTS table and JOINs with USERS)
    const contactsSql = `
      SELECT u.USER_ID, u.FULL_NAME, u.USERNAME, u.PHONE_NUMBER, u.PROFILE_PICTURE, u.IS_ONLINE, c.SAVED_NAME
      FROM CONTACTS c
      JOIN USERS u ON c.CONTACT_USER_ID = u.USER_ID
      WHERE c.USER_ID = :userId
        AND (
          LOWER(u.FULL_NAME) LIKE :query 
          OR LOWER(u.USERNAME) LIKE :query 
          OR LOWER(c.SAVED_NAME) LIKE :query
          OR u.PHONE_NUMBER LIKE :query
        )
    `;
    const contactsResult = await connection.execute(contactsSql, {
      userId,
      query: searchPattern,
    });

    const contacts = contactsResult.rows.map((row) => ({
      userId: row[0],
      fullName: row[1],
      username: row[2],
      phoneNumber: row[3],
      profilePicture: row[4],
      isOnline: row[5] === "Y",
      savedName: row[6],
    }));

    // 2. Search Direct Chats (Uses CHAT_MEMBER table and JOINs with USERS)
    const directChatsSql = `
      SELECT c.CHAT_ID, c.CHAT_TYPE, u.USER_ID AS OTHER_USER_ID, u.FULL_NAME, u.PROFILE_PICTURE, u.IS_ONLINE
      FROM CHAT c
      JOIN CHAT_MEMBER cm1 ON c.CHAT_ID = cm1.CHAT_ID AND cm1.USER_ID = :userId
      JOIN CHAT_MEMBER cm2 ON c.CHAT_ID = cm2.CHAT_ID AND cm2.USER_ID != :userId
      JOIN USERS u ON cm2.USER_ID = u.USER_ID
      WHERE c.CHAT_TYPE = 'DIRECT'
        AND (LOWER(u.FULL_NAME) LIKE :query OR LOWER(u.USERNAME) LIKE :query)
    `;
    const directChatsResult = await connection.execute(directChatsSql, {
      userId,
      query: searchPattern,
    });

    const directChats = directChatsResult.rows.map((row) => ({
      chatId: row[0],
      chatType: row[1],
      otherUserId: row[2],
      name: row[3],
      profilePicture: row[4],
      isOnline: row[5] === "Y",
    }));

    // 3. Search Groups (Uses CHAT, CHAT_MEMBER, and GROUP_METADATA)
    const groupsSql = `
      SELECT c.CHAT_ID, c.CHAT_TYPE, c.TITLE, gm.DESCRIPTION, gm.GROUP_TYPE
      FROM CHAT c
      JOIN CHAT_MEMBER cm ON c.CHAT_ID = cm.CHAT_ID
      LEFT JOIN GROUP_METADATA gm ON c.CHAT_ID = gm.CHAT_ID
      WHERE cm.USER_ID = :userId
        AND c.CHAT_TYPE = 'GROUP'
        AND LOWER(c.TITLE) LIKE :query
    `;
    const groupsResult = await connection.execute(groupsSql, {
      userId,
      query: searchPattern,
    });

    const groups = groupsResult.rows.map((row) => ({
      chatId: row[0],
      chatType: row[1],
      title: row[2],
      description: row[3],
      groupType: row[4],
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        contacts,
        directChats,
        groups,
      })
    );
  } catch (err) {
    console.error("Error performing search:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to perform search" }));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {
        console.error(e);
      }
    }
  }
};