import {
  handleSendOtp,
  handleVerifyOtp,
  handleRegister,
  handleLogin,
} from "../controllers/auth.controller.js";

export async function handleAuthRoutes(req, res) {
  if (req.url === "/api/auth/send-otp" && req.method === "POST") {
    await handleSendOtp(req, res);
    return true;
  }

  if (req.url === "/api/auth/verify-otp" && req.method === "POST") {
    await handleVerifyOtp(req, res);
    return true;
  }

  if (req.url === "/api/auth/register" && req.method === "POST") {
    await handleRegister(req, res);
    return true;
  }

  if (req.url === "/api/auth/login" && req.method === "POST") {
    await handleLogin(req, res);
    return true;
  }

  return false;
}
