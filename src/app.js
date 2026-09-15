import http from "http";
import { config } from "./config/env.js";
import { initializeDatabase, closeDatabase } from "./config/database.js";
import { parseJsonBody } from "./utils/body.parser.js";
import { handleAuthRoutes } from "./routes/auth.routes.js";
import { handleUserRoutes } from "./routes/user.routes.js";
import { handleContactRoutes } from "./routes/contact.routes.js";

const PORT = config.PORT;

// Custom Request Router
const requestHandler = async (req, res) => {
  // Set default JSON headers and CORS
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle Preflight Options Request
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Parse request body for POST, PUT, PATCH methods
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
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
        })
      );
    }

    // Route Modules Dispatcher
    if (req.url.startsWith("/api/auth")) {
      const handled = await handleAuthRoutes(req, res);
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

    // 404 Not Found Fallback (inside try block)
    if (!res.headersSent) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: "Route not found" }));
    }
  } catch (err) {
    console.error("Request Error:", err);
    if (!res.headersSent) {
      res.writeHead(400);
      return res.end(
        JSON.stringify({ error: err.message || "Malformed or invalid request" })
      );
    }
  }
};

// Create Server
const server = http.createServer(requestHandler);

// Initialize DB and Start Server
async function startServer() {
  await initializeDatabase();

  server.listen(PORT, () => {
    console.log(
      `Server running in ${config.NODE_ENV || "development"} mode on port ${PORT}`
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