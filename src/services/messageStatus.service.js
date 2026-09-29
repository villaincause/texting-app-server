import oracledb from "oracledb";
import { getConnection } from "../config/database.js";

/**
 * Mark a message as DELIVERED for a specific user.
 *
 * The user must be a member of the chat containing the message.
 * A message can move from SENT -> DELIVERED.
 * If it is already SEEN, we do not downgrade it.
 */
export async function markMessageDelivered(messageId, userId) {
  let connection;

  try {
    connection = await getConnection();

    // Make sure the message exists and the user belongs to its chat
    const messageSql = `
      SELECT m.MESSAGE_ID
      FROM MESSAGE m
      JOIN CHAT_MEMBER cm
        ON cm.CHAT_ID = m.CHAT_ID
       AND cm.USER_ID = :userId
      WHERE m.MESSAGE_ID = :messageId
    `;

    const messageResult = await connection.execute(
      messageSql,
      {
        messageId,
        userId,
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      },
    );

    if (messageResult.rows.length === 0) {
      await connection.close();
      return {
        success: false,
        error: "Message not found or user is not a chat member",
      };
    }

    // Check existing status
    const statusSql = `
      SELECT STATUS
      FROM MESSAGE_STATUS
      WHERE MESSAGE_ID = :messageId
        AND USER_ID = :userId
    `;

    const statusResult = await connection.execute(
      statusSql,
      {
        messageId,
        userId,
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      },
    );

    const currentStatus = statusResult.rows[0]?.STATUS;

    // Never downgrade SEEN -> DELIVERED
    if (currentStatus === "SEEN") {
      await connection.close();

      return {
        success: true,
        status: "SEEN",
        changed: false,
      };
    }

    if (currentStatus === "DELIVERED") {
      await connection.close();

      return {
        success: true,
        status: "DELIVERED",
        changed: false,
      };
    }

    if (currentStatus === "SENT") {
      const updateSql = `
        UPDATE MESSAGE_STATUS
        SET STATUS = 'DELIVERED',
            STATUS_TIME = CURRENT_TIMESTAMP
        WHERE MESSAGE_ID = :messageId
          AND USER_ID = :userId
      `;

      await connection.execute(updateSql, {
        messageId,
        userId,
      });
    } else {
      // No status exists yet for this user.
      const insertSql = `
        INSERT INTO MESSAGE_STATUS (
          MESSAGE_ID,
          USER_ID,
          STATUS,
          STATUS_TIME
        )
        VALUES (
          :messageId,
          :userId,
          'DELIVERED',
          CURRENT_TIMESTAMP
        )
      `;

      await connection.execute(insertSql, {
        messageId,
        userId,
      });
    }

    await connection.commit();
    await connection.close();

    return {
      success: true,
      status: "DELIVERED",
      changed: true,
    };
  } catch (error) {
    console.error("markMessageDelivered error:", error);

    if (connection) {
      try {
        await connection.rollback();
        await connection.close();
      } catch (closeError) {}
    }

    throw error;
  }
}

/**
 * Mark a message as SEEN for a specific user.
 *
 * SEEN is the highest state.
 * A message cannot go backwards from SEEN to DELIVERED/SENT.
 */
export async function markMessageSeen(messageId, userId) {
  let connection;

  try {
    connection = await getConnection();

    // Make sure the message exists and the user belongs to its chat
    const messageSql = `
      SELECT m.MESSAGE_ID
      FROM MESSAGE m
      JOIN CHAT_MEMBER cm
        ON cm.CHAT_ID = m.CHAT_ID
       AND cm.USER_ID = :userId
      WHERE m.MESSAGE_ID = :messageId
    `;

    const messageResult = await connection.execute(
      messageSql,
      {
        messageId,
        userId,
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      },
    );

    if (messageResult.rows.length === 0) {
      await connection.close();

      return {
        success: false,
        error: "Message not found or user is not a chat member",
      };
    }

    // Check existing status
    const statusSql = `
      SELECT STATUS
      FROM MESSAGE_STATUS
      WHERE MESSAGE_ID = :messageId
        AND USER_ID = :userId
    `;

    const statusResult = await connection.execute(
      statusSql,
      {
        messageId,
        userId,
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      },
    );

    const currentStatus = statusResult.rows[0]?.STATUS;

    // Already seen
    if (currentStatus === "SEEN") {
      await connection.close();

      return {
        success: true,
        status: "SEEN",
        changed: false,
      };
    }

    if (currentStatus === "SENT" || currentStatus === "DELIVERED") {
      const updateSql = `
        UPDATE MESSAGE_STATUS
        SET STATUS = 'SEEN',
            STATUS_TIME = CURRENT_TIMESTAMP
        WHERE MESSAGE_ID = :messageId
          AND USER_ID = :userId
      `;

      await connection.execute(updateSql, {
        messageId,
        userId,
      });
    } else {
      // No status exists yet.
      const insertSql = `
        INSERT INTO MESSAGE_STATUS (
          MESSAGE_ID,
          USER_ID,
          STATUS,
          STATUS_TIME
        )
        VALUES (
          :messageId,
          :userId,
          'SEEN',
          CURRENT_TIMESTAMP
        )
      `;

      await connection.execute(insertSql, {
        messageId,
        userId,
      });
    }

    await connection.commit();
    await connection.close();

    return {
      success: true,
      status: "SEEN",
      changed: true,
    };
  } catch (error) {
    console.error("markMessageSeen error:", error);

    if (connection) {
      try {
        await connection.rollback();
        await connection.close();
      } catch (closeError) {}
    }

    throw error;
  }
}
