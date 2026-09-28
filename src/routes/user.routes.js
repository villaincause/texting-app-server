import { authenticateToken } from "../middleware/auth.js";
import {
  handleGetProfile,
  handleUpdateProfile,
  handleGetUserById,
} from "../controllers/user.controller.js";

export async function handleUserRoutes(req, res) {
  if (req.url === "/api/user/profile") {
    const authenticated = authenticateToken(req, res);

    if (!authenticated) return true;

    if (req.method === "GET") {
      await handleGetProfile(req, res);
      return true;
    }

    if (req.method === "PUT") {
      await handleUpdateProfile(req, res);
      return true;
    }
  }

  const userMatch = req.url.match(/^\/api\/user\/(\d+)$/);

  if (userMatch) {
    const authenticated = authenticateToken(req, res);

    if (!authenticated) return true;

    if (req.method === "GET") {
      req.params = {
        userId: userMatch[1],
      };

      await handleGetUserById(req, res);
      return true;
    }
  }

  return false;
}
