import { authenticateToken } from '../middleware/auth.js';
import { handleSendMessage, handleGetMessages } from '../controllers/message.controller.js';

export async function handleMessageRoutes(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (!pathname.startsWith('/api/messages')) return false;

  // Authenticate User
  const user = authenticateToken(req, res);
  if (!user) return true;

  // POST /api/messages - Send Message
  if ((pathname === '/api/messages' || pathname === '/api/messages/') && req.method === 'POST') {
    await handleSendMessage(req, res);
    return true;
  }

  // GET /api/messages/:chatId - Fetch Messages
  const match = pathname.match(/^\/api\/messages\/(\d+)$/);
  if (match && req.method === 'GET') {
    const chatId = match[1];
    await handleGetMessages(req, res, chatId);
    return true;
  }

  return false;
}