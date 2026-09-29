import { authenticateToken } from '../middleware/auth.js';
import {
  handleCreateOrGetDirectChat,
  handleGetUserChats,
  handleGetGroupMembers,
  handleAddGroupMember
} from '../controllers/chat.controller.js';
import {
  handleGetNotices,
  handleCreateNotice,
  handleGetAssignments,
  handleCreateAssignment,
  handleSubmitAssignment,
  handleGetAssignmentSubmissions
} from '../controllers/info.controller.js';

export async function handleChatRoutes(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Allows both /api/chats and /api/assignments through
  if (!pathname.startsWith('/api/chats') && !pathname.startsWith('/api/assignments')) {
    return false;
  }

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

  // Matching Route: /api/chats/:chatId/notices
  const noticeMatch = pathname.match(/^\/api\/chats\/([^\/]+)\/notices\/?$/);
  if (noticeMatch) {
    const chatId = noticeMatch[1];
    if (req.method === 'GET') {
      await handleGetNotices(req, res, chatId);
      return true;
    }
    if (req.method === 'POST') {
      await handleCreateNotice(req, res, chatId);
      return true;
    }
  }

  // Matching Route: /api/chats/:chatId/assignments
  const assignmentMatch = pathname.match(/^\/api\/chats\/([^\/]+)\/assignments\/?$/);
  if (assignmentMatch) {
    const chatId = assignmentMatch[1];
    if (req.method === 'GET') {
      await handleGetAssignments(req, res, chatId);
      return true;
    }
    if (req.method === 'POST') {
      await handleCreateAssignment(req, res, chatId);
      return true;
    }
  }

  // Matching Route: /api/assignments/:assignmentId/submissions (Admin / Teacher view)
  const submissionsMatch = pathname.match(/^\/api\/assignments\/([^\/]+)\/submissions\/?$/);
  if (submissionsMatch) {
    const assignmentId = submissionsMatch[1];
    if (req.method === 'GET') {
      await handleGetAssignmentSubmissions(req, res, assignmentId);
      return true;
    }
  }

  // Matching Route: /api/assignments/:assignmentId/submit
  const submissionMatch = pathname.match(/^\/api\/assignments\/([^\/]+)\/submit\/?$/);
  if (submissionMatch) {
    const assignmentId = submissionMatch[1];
    if (req.method === 'POST') {
      await handleSubmitAssignment(req, res, assignmentId);
      return true;
    }
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