import { authenticateToken } from '../middleware/auth.js';
import {
  handleGetProfile,
  handleUpdateProfile,
  handleGetUserById,
  handleGetAllUsers // <-- Add this controller function
} from '../controllers/user.controller.js';

export async function handleUserRoutes(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Allow both /api/user and /api/users
  if (!pathname.startsWith('/api/user') && !pathname.startsWith('/api/users')) {
    return false;
  }

  // Verify Auth
  const user = authenticateToken(req, res);
  if (!user) return true; // Handled by auth middleware (401 response)

  // GET /api/users - Fetch All Users
  if ((pathname === '/api/users' || pathname === '/api/users/') && req.method === 'GET') {
    if (typeof handleGetAllUsers === 'function') {
      await handleGetAllUsers(req, res);
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'handleGetAllUsers is not implemented in controller.' }));
    }
    return true;
  }

  // Profile Endpoints
  if (pathname === '/api/user/profile' || pathname === '/api/user/profile/') {
    if (req.method === 'GET') {
      await handleGetProfile(req, res);
      return true;
    }

    if (req.method === 'PUT') {
      await handleUpdateProfile(req, res);
      return true;
    }
  }

  // Dynamic Route: /api/user/:id
  const match = pathname.match(/^\/api\/user\/([^\/]+)\/?$/);
  if (match && req.method === 'GET') {
    const targetUserId = match[1];
    await handleGetUserById(req, res, targetUserId);
    return true;
  }

  return false;
}