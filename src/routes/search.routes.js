import { searchAll } from "../controllers/search.controller.js";

const sendResponse = (res, statusCode, data) => {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

export const handleSearchRoutes = async (req, res, userId) => {
  const { method, url } = req;

  if (!userId) {
    sendResponse(res, 401, { error: "Unauthorized: Authentication required" });
    return true;
  }

  // GET /api/search?q=keyword
  if (url.startsWith("/api/search") && method === "GET") {
    await searchAll(req, res, userId);
    return true;
  }

  return false;
};