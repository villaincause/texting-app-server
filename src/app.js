import http from "http";
import oracledb from "oracledb";
import { config } from "./config/env.js";
import { initializeDatabase, closeDatabase } from "./config/database.js";
import { parseJsonBody } from "./utils/body.parser.js";
import { handleAuthRoutes } from "./routes/auth.routes.js";
import { handleUserRoutes } from "./routes/user.routes.js";
import { handleContactRoutes } from "./routes/contact.routes.js";
import { handleChatRoutes } from "./routes/chat.routes.js";
import { handleMessageRoutes } from "./routes/message.routes.js";
import { handleMediaRoutes } from "./routes/media.routes.js";
import { initializeSocket } from "./socket/socket.js";

const PORT = config.PORT;

// Set OracleDB fetchAsString for CLOBs to avoid stream handling issues
oracledb.fetchAsString = [oracledb.CLOB];

// Custom Request Router
const requestHandler = async (req, res) => {
  // Set default JSON headers and CORS
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle Preflight Options Request
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Parse JSON bodies centrally.
    // Multipart uploads must remain as streams for Busboy.
    const contentType = req.headers["content-type"] || "";

    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      !contentType.toLowerCase().includes("multipart/form-data")
    ) {
      req.body = await parseJsonBody(req);
    } else {
      req.body = {};
    }

    // Health Check Route
    if (req.url === "/api/health" && req.method === "GET") {
      res.writeHead(200);
      return res.end(
        JSON.stringify({
          status: "OK",
          message: "Server & DB Pool operational",
        }),
      );
    }

    // Route Modules Dispatcher
    if (req.url.startsWith("/api/auth")) {
      const handled = await handleAuthRoutes(req, res);
      if (handled) return;
    }
    if (req.url.startsWith("/api/media")) {
      const handled = await handleMediaRoutes(req, res);
      if (handled) return;
    }

    if (req.url.startsWith("/api/user")) {
      const handled = await handleUserRoutes(req, res);
      if (handled) return;
    }

    if (req.url.startsWith("/api/contacts")) {
      const handled = await handleContactRoutes(req, res);
      if (handled) return;
    }

    if (req.url.startsWith("/api/chats")) {
      const handled = await handleChatRoutes(req, res);
      if (handled) return;
    }

    if (req.url.startsWith("/api/messages")) {
      const handled = await handleMessageRoutes(req, res);
      if (handled) return;
    }

    // 404 Not Found Fallback
    if (!res.headersSent) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: "Route not found" }));
    }
  } catch (err) {
    console.error("Request Error:", err);
    if (!res.headersSent) {
      res.writeHead(500);
      return res.end(
        JSON.stringify({ error: err.message || "Internal Server Error" }),
      );
    }
  }
};

// Create Server
const server = http.createServer(requestHandler);

// Initialize Socket.io Server Attachment
initializeSocket(server);

// Initialize DB and Start Server
async function startServer() {
  await initializeDatabase();

  server.listen(PORT, () => {
    console.log(
      `Server running in ${config.NODE_ENV || "development"} mode on port ${PORT}`,
    );
  });
}

// Graceful Shutdown Handlers
const shutdown = async () => {
  console.log("\nShutting down gracefully...");
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();