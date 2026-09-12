import { config } from "../config/env.js";
import crypto from "crypto";

const otpStore = new Map();

const OTP_EXPIRY = 5 * 60 * 1000;

const OTP_PURPOSES = Object.freeze({
  LOGIN: "LOGIN",
  REGISTRATION: "REGISTRATION",
});

function normalizePhoneNumber(phoneNumber) {
  return typeof phoneNumber === "string"
    ? phoneNumber.replace(/\s/g, "").trim()
    : phoneNumber;
}

function createOtpKey(phoneNumber, purpose) {
  return `${purpose}:${phoneNumber}`;
}

// DEVELOPMENT OTP - TERMINAL ONLY
// ============================================

export const generateOTP = async (phoneNumber, purpose) => {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!cleanPhoneNumber) {
    throw new Error("Phone number is required");
  }

  if (!Object.values(OTP_PURPOSES).includes(purpose)) {
    throw new Error("Invalid OTP purpose");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  const otpKey = createOtpKey(cleanPhoneNumber, purpose);

  otpStore.set(otpKey, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY,
  });

  console.log("====================================");
  console.log("        DEVELOPMENT OTP");
  console.log("====================================");
  console.log(`Purpose: ${purpose}`);
  console.log(`Phone:   ${cleanPhoneNumber}`);
  console.log(`OTP:     ${otp}`);
  console.log("Expires in: 5 minutes");
  console.log("====================================");

  return true;
};

// PRODUCTION OTP - BULKSMSBD
// ============================================

// export const generateOTP = async (phoneNumber, purpose) => {
//   const cleanPhoneNumber = normalizePhoneNumber(phoneNumber);
//
//   if (!cleanPhoneNumber) {
//     throw new Error("Phone number is required");
//   }
//
//   if (!Object.values(OTP_PURPOSES).includes(purpose)) {
//     throw new Error("Invalid OTP purpose");
//   }
//
//   const otp = Math.floor(100000 + Math.random() * 900000).toString();
//
//   const otpKey = createOtpKey(cleanPhoneNumber, purpose);
//
//   otpStore.set(otpKey, {
//     otp,
//     expiresAt: Date.now() + OTP_EXPIRY,
//   });
//
//   const response = await fetch("http://bulksmsbd.net/api/smsapi", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       api_key: config.BULKSMSBD_API_KEY,
//       senderid: config.BULKSMSBD_SENDER_ID,
//       number: cleanPhoneNumber,
//       message: `Your Texting App verification code is ${otp}`,
//     }),
//   });
//
//   const data = await response.json();
//
//   if (!response.ok) {
//     otpStore.delete(otpKey);
//     throw new Error("Failed to send OTP");
//   }
//
//   return true;
// };

export const verifyOTP = (phoneNumber, otp, purpose) => {
  const cleanPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!cleanPhoneNumber || !otp) {
    return false;
  }

  if (!Object.values(OTP_PURPOSES).includes(purpose)) {
    return false;
  }

  const otpKey = createOtpKey(cleanPhoneNumber, purpose);

  const stored = otpStore.get(otpKey);

  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(otpKey);
    return false;
  }

  if (stored.otp !== otp) {
    return false;
  }

  otpStore.delete(otpKey);

  return true;
};
