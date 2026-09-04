import { verifyToken } from '../utils/jwt.js';

export function authenticateToken(req, res) {
  const authHeader = req.headers['authorization'];
  // Expecting format: "Bearer <TOKEN>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Access denied. No token provided.' }));
    return null;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Invalid or expired token.' }));
    return null;
  }

  // Attach decoded user info (userId, username) to request object
  req.user = decoded;
  return decoded;
}