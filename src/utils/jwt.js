import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

const JWT_SECRET = config.JWT_SECRET || "default_secret";
const EXPIRES_IN = "7d";

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
