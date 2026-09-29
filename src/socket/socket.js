import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import {
  markMessageDelivered,
  markMessageSeen,
} from "../services/messageStatus.service.js";
import { getConnection } from "../config/database.js";

let io = null;

const onlineUsers = new Map();

/**
 * Add a socket connection for a user.
 */
const addUserSocket = (userId, socketId) => {
  const numericUserId = Number(userId);

  if (!onlineUsers.has(numericUserId)) {
    onlineUsers.set(numericUserId, new Set());
  }

  onlineUsers.get(numericUserId).add(socketId);
};

/**
 * Remove a socket connection for a user.
 *
 * Returns true if the user has no remaining connections.
 */
const removeUserSocket = (userId, socketId) => {
  const numericUserId = Number(userId);
  const sockets = onlineUsers.get(numericUserId);

  if (!sockets) {
    return true;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(numericUserId);
    return true;
  }

  return false;
};

/**
 * Update user's online state in Oracle.
 */
const setUserOnline = async (userId) => {
  let connection;

  try {
    connection = await getConnection();

    await connection.execute(
      `
        UPDATE USERS
        SET
          IS_ONLINE = 'Y',
          UPDATED_AT = CURRENT_TIMESTAMP
        WHERE USER_ID = :userId
      `,
      {
        userId: Number(userId),
      },
      {
        autoCommit: true,
      },
    );
  } catch (error) {
    console.error(`[Socket] Failed to set user ${userId} ONLINE:`, error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error("[Socket] Failed to close DB connection:", error);
      }
    }
  }
};

/**
 * Update user's offline state and LAST_SEEN in Oracle.
 *
 * Returns the timestamp used for LAST_SEEN.
 */
const setUserOffline = async (userId) => {
  let connection;

  try {
    connection = await getConnection();

    await connection.execute(
      `
        UPDATE USERS
        SET
          IS_ONLINE = 'N',
          LAST_SEEN = CURRENT_TIMESTAMP,
          UPDATED_AT = CURRENT_TIMESTAMP
        WHERE USER_ID = :userId
      `,
      {
        userId: Number(userId),
      },
      {
        autoCommit: true,
      },
    );

    // Get the exact LAST_SEEN value that was saved.
    const result = await connection.execute(
      `
        SELECT LAST_SEEN
        FROM USERS
        WHERE USER_ID = :userId
      `,
      {
        userId: Number(userId),
      },
      {
        outFormat: 4002,
      },
    );

    const row = result.rows?.[0];

    if (!row?.LAST_SEEN) {
      return null;
    }

    return row.LAST_SEEN;
  } catch (error) {
    console.error(`[Socket] Failed to set user ${userId} OFFLINE:`, error);

    return null;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error("[Socket] Failed to close DB connection:", error);
      }
    }
  }
};

/**
 * Get a user's current presence from Oracle.
 */
const getUserPresence = async (userId) => {
  let connection;

  try {
    connection = await getConnection();

    const result = await connection.execute(
      `
        SELECT
          USER_ID,
          IS_ONLINE,
          LAST_SEEN
        FROM USERS
        WHERE USER_ID = :userId
      `,
      {
        userId: Number(userId),
      },
      {
        outFormat: 4002,
      },
    );

    const row = result.rows?.[0];

    if (!row) {
      return null;
    }

    return {
      userId: Number(row.USER_ID),
      status: row.IS_ONLINE === "Y" ? "ONLINE" : "OFFLINE",
      lastSeen: row.LAST_SEEN ? new Date(row.LAST_SEEN).toISOString() : null,
    };
  } catch (error) {
    console.error(`[Socket] Failed to get presence for user ${userId}:`, error);

    return null;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error("[Socket] Failed to close DB connection:", error);
      }
    }
  }
};

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  console.log("Socket.IO initialized and ready for connections.");

  // =========================================================
  // AUTHENTICATION
  // =========================================================

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }

    socket.user = decoded;

    next();
  });

  io.on("connection", async (socket) => {
    const userId = Number(socket.user.userId);

    console.log(`[Socket] User connected: ID ${userId} (Socket: ${socket.id})`);

    // =========================================================
    // ONLINE USER TRACKING
    // =========================================================

    const alreadyOnline = onlineUsers.has(userId);

    addUserSocket(userId, socket.id);

    // Only update/broadcast ONLINE when this is the
    // user's first active connection.
    if (!alreadyOnline) {
      await setUserOnline(userId);

      io.emit("user_status", {
        userId,
        status: "ONLINE",
        lastSeen: null,
      });

      console.log(`[Socket] User ${userId} is now ONLINE`);
    }

    // =========================================================
    // GET USER STATUS
    // =========================================================

    socket.on("get_user_status", async (payload) => {
      try {
        const targetUserId =
          typeof payload === "object" ? payload?.userId : payload;

        if (!targetUserId) {
          return;
        }

        const numericTargetUserId = Number(targetUserId);

        // If there is an active socket connection, the user
        // is definitely online.
        const hasActiveSocket = onlineUsers.has(numericTargetUserId);

        if (hasActiveSocket) {
          socket.emit("user_status", {
            userId: numericTargetUserId,
            status: "ONLINE",
            lastSeen: null,
          });

          return;
        }

        // Otherwise get the stored status/last seen from Oracle.
        const presence = await getUserPresence(numericTargetUserId);

        if (!presence) {
          return;
        }

        socket.emit("user_status", presence);
      } catch (error) {
        console.error("[Socket] get_user_status error:", error);
      }
    });

    // =========================================================
    // JOIN CHAT
    // =========================================================

    socket.on("join_chat", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;

      if (!chatId) {
        return;
      }

      const room = `chat_${chatId}`;

      socket.join(room);

      console.log(`[Socket] User ${userId} joined room ${room}`);
    });

    // =========================================================
    // LEAVE CHAT
    // =========================================================

    socket.on("leave_chat", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;

      if (!chatId) {
        return;
      }

      const room = `chat_${chatId}`;

      socket.leave(room);

      console.log(`[Socket] User ${userId} left room ${room}`);
    });

    // =========================================================
    // MESSAGE DELIVERED
    // =========================================================

    socket.on("message_delivered", async (payload) => {
      try {
        const messageId =
          typeof payload === "object" ? payload?.messageId : payload;

        const chatId = typeof payload === "object" ? payload?.chatId : null;

        if (!messageId) {
          console.warn(
            `[Socket] message_delivered missing messageId from user ${userId}`,
          );
          return;
        }

        const result = await markMessageDelivered(messageId, userId);

        if (!result.success) {
          console.warn(
            `[Socket] Unable to mark message ${messageId} as delivered: ${result.error}`,
          );
          return;
        }

        console.log(
          `[Socket] Message ${messageId} delivered to user ${userId}`,
        );

        if (chatId) {
          io.to(`chat_${chatId}`).emit("message_status", {
            messageId: Number(messageId),
            userId: Number(userId),
            status: result.status,
            statusTime: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("[Socket] message_delivered error:", error);
      }
    });

    // =========================================================
    // MESSAGE SEEN
    // =========================================================

    socket.on("message_seen", async (payload) => {
      try {
        const messageId =
          typeof payload === "object" ? payload?.messageId : payload;

        const chatId = typeof payload === "object" ? payload?.chatId : null;

        if (!messageId) {
          console.warn(
            `[Socket] message_seen missing messageId from user ${userId}`,
          );
          return;
        }

        const result = await markMessageSeen(messageId, userId);

        if (!result.success) {
          console.warn(
            `[Socket] Unable to mark message ${messageId} as seen: ${result.error}`,
          );
          return;
        }

        console.log(`[Socket] Message ${messageId} seen by user ${userId}`);

        if (chatId) {
          io.to(`chat_${chatId}`).emit("message_status", {
            messageId: Number(messageId),
            userId: Number(userId),
            status: result.status,
            statusTime: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("[Socket] message_seen error:", error);
      }
    });

    // =========================================================
    // TYPING START
    // =========================================================

    socket.on("typing_start", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;

      if (!chatId) {
        return;
      }

      socket.to(`chat_${chatId}`).emit("user_typing", {
        chatId,
        userId,
        username: socket.user.username,
        isTyping: true,
      });
    });

    // =========================================================
    // TYPING STOP
    // =========================================================

    socket.on("typing_stop", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;

      if (!chatId) {
        return;
      }

      socket.to(`chat_${chatId}`).emit("user_typing", {
        chatId,
        userId,
        username: socket.user.username,
        isTyping: false,
      });
    });

    // =========================================================
    // DISCONNECT
    // =========================================================

    socket.on("disconnect", async (reason) => {
      console.log(
        `[Socket] User disconnected: ID ${userId}, reason: ${reason}`,
      );

      // Remove this particular socket.
      const becameOffline = removeUserSocket(userId, socket.id);

      // Another device/socket is still connected.
      if (!becameOffline) {
        console.log(`[Socket] User ${userId} still has active connections`);

        return;
      }

      // No sockets remain.
      const lastSeen = await setUserOffline(userId);

      io.emit("user_status", {
        userId,
        status: "OFFLINE",
        lastSeen: lastSeen
          ? new Date(lastSeen).toISOString()
          : new Date().toISOString(),
      });

      console.log(`[Socket] User ${userId} is now OFFLINE`);
    });
  });

  return io;
};

// =========================================================
// GET SOCKET.IO INSTANCE
// =========================================================

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io has not been initialized!");
  }

  return io;
};

// =========================================================
// CHECK USER ONLINE
// =========================================================

export const isUserOnline = (userId) => {
  return onlineUsers.has(Number(userId));
};
