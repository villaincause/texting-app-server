import { handleSendOtp, handleRegister } from '../controllers/auth.controller.js';

export async function handleAuthRoutes(req, res) {
  if (req.url === '/api/auth/send-otp' && req.method === 'POST') {
    await handleSendOtp(req, res, req.body);
    return true;
  }

  if (req.url === '/api/auth/register' && req.method === 'POST') {
    await handleRegister(req, res, req.body);
    return true;
  }

  return false;
}