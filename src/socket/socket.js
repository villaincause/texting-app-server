// src/socket/socket.js
import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";

let io = null;

// Track active connected users: Map<userId, socketId>
const onlineUsers = new Map();

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  console.log("Socket.IO initialized and ready for connections.");

  // Authentication Middleware for WebSockets
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

    // Attach authenticated user information to socket instance
    socket.user = decoded;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.user.userId;
    console.log(`[Socket] User connected: ID ${userId} (Socket: ${socket.id})`);

    // Track online user status
    onlineUsers.set(userId, socket.id);
    io.emit("user_status", { userId, status: "ONLINE" });

    // Join room for a specific chat (handles primitive ID or object payload)
    socket.on("join_chat", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;
      if (chatId) {
        const room = `chat_${chatId}`;
        socket.join(room);
        console.log(`[Socket] User ${userId} joined room ${room}`);
      }
    });

    // Leave room for a specific chat (handles primitive ID or object payload)
    socket.on("leave_chat", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;
      if (chatId) {
        const room = `chat_${chatId}`;
        socket.leave(room);
        console.log(`[Socket] User ${userId} left room ${room}`);
      }
    });

    // Typing indicators
    socket.on("typing_start", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;
      if (chatId) {
        socket.to(`chat_${chatId}`).emit("user_typing", {
          chatId,
          userId,
          username: socket.user.username,
          isTyping: true
        });
      }
    });

    socket.on("typing_stop", (payload) => {
      const chatId = typeof payload === "object" ? payload?.chatId : payload;
      if (chatId) {
        socket.to(`chat_${chatId}`).emit("user_typing", {
          chatId,
          userId,
          username: socket.user.username,
          isTyping: false
        });
      }
    });

    // Handle user disconnect
    socket.on("disconnect", () => {
      console.log(`[Socket] User disconnected: ID ${userId}`);
      onlineUsers.delete(userId);
      io.emit("user_status", { userId, status: "OFFLINE" });
    });
  });

  return io;
};

// Utility to get the initialized IO instance anywhere in the app
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io has not been initialized!");
  }
  return io;
};

// Utility to check online status of a user
export const isUserOnline = (userId) => {
  return onlineUsers.has(Number(userId));
};