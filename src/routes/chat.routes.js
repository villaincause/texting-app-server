import { authenticateToken } from '../middleware/auth.js';
import {
  handleCreateOrGetDirectChat,
  handleGetUserChats,
  handleGetGroupMembers,
  handleAddGroupMember
} from '../controllers/chat.controller.js';

export async function handleChatRoutes(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (!pathname.startsWith('/api/chats')) return false;

  // Authenticate User
  const user = authenticateToken(req, res);
  if (!user) return true;

  // POST /api/chats - Create or Get Direct Chat
  if ((pathname === '/api/chats' || pathname === '/api/chats/') && req.method === 'POST') {
    await handleCreateOrGetDirectChat(req, res);
    return true;
  }

  // GET /api/chats - Get User Chat List
  if ((pathname === '/api/chats' || pathname === '/api/chats/') && req.method === 'GET') {
    await handleGetUserChats(req, res);
    return true;
  }

  // Matching Route: /api/chats/:chatId/members
  const membersMatch = pathname.match(/^\/api\/chats\/([^\/]+)\/members\/?$/);
  if (membersMatch) {
    const chatId = membersMatch[1];

    // GET /api/chats/:chatId/members - Get Group Members
    if (req.method === 'GET') {
      await handleGetGroupMembers(req, res, chatId);
      return true;
    }

    // POST /api/chats/:chatId/members - Add Group Member(s)
    if (req.method === 'POST') {
      await handleAddGroupMember(req, res, chatId);
      return true;
    }
  }

  return false;
}