import { getUserNotifications, setChatMute } from '../controllers/notification.controller.js';

const sendResponse = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

export const handleNotificationRoutes = async (req, res, userId) => {
  const { url, method, body } = req;

  // Protect all notification routes - require authenticated user
  if (!userId) {
    sendResponse(res, 401, { error: 'Unauthorized: Authentication required' });
    return true;
  }

  // GET /api/notifications -> Fetch all notifications for the user
  if (url === '/api/notifications' && method === 'GET') {
    await getUserNotifications(req, res, userId);
    return true;
  }

  // POST /api/notifications/mute -> Mute or unmute notifications for a specific chat
  if (url === '/api/notifications/mute' && method === 'POST') {
    const { chatId, muteOption } = body || {};

    if (!chatId) {
      sendResponse(res, 400, { error: 'Missing required field: chatId' });
      return true;
    }

    if (!muteOption) {
      sendResponse(res, 400, { error: 'Missing required field: muteOption' });
      return true;
    }

    await setChatMute(req, res, body, userId, chatId);
    return true;
  }

  // Route not handled by this module
  return false;
};