import { authenticateToken } from '../middleware/auth.js';
import { handleGetProfile, handleUpdateProfile } from '../controllers/user.controller.js';

export async function handleUserRoutes(req, res) {
  if (req.url === '/api/user/profile') {
    // Authenticate token for all /api/user/profile endpoints
    const authenticated = authenticateToken(req, res);
    if (!authenticated) return true;

    if (req.method === 'GET') {
      await handleGetProfile(req, res);
      return true;
    }

    if (req.method === 'PUT') {
      await handleUpdateProfile(req, res);
      return true;
    }
  }

  return false;
}