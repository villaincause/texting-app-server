import { authenticateToken } from '../middleware/auth.js';
import { handleGetContacts, handleSyncContacts } from '../controllers/contact.controller.js';

export async function handleContactRoutes(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (!pathname.startsWith('/api/contacts')) return false;

  // Verify Auth - returns null if unauthorized (auth middleware writes 401 response directly)
  const user = authenticateToken(req, res);
  if (!user) {
    return true; // Mark as handled so router doesn't hit 404
  }

  if ((pathname === '/api/contacts' || pathname === '/api/contacts/') && req.method === 'GET') {
    await handleGetContacts(req, res);
    return true;
  }

  if ((pathname === '/api/contacts/sync' || pathname === '/api/contacts/sync/') && req.method === 'POST') {
    await handleSyncContacts(req, res);
    return true;
  }

  return false;
}