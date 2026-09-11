import { config } from "../config/env.js";

const otpStore = new Map();

const OTP_EXPIRY = 5 * 60 * 1000;

export const generateOTP = async (phoneNumber) => {
  const cleanPhoneNumber = phoneNumber.replace(/\s/g, "");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore.set(cleanPhoneNumber, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY,
  });

  const response = await fetch("http://bulksmsbd.net/api/smsapi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: config.BULKSMSBD_API_KEY,
      senderid: config.BULKSMSBD_SENDER_ID,
      number: cleanPhoneNumber,
      message: `Your Texting App verification code is ${otp}`,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    otpStore.delete(cleanPhoneNumber);
    throw new Error("Failed to send OTP");
  }

  return true;
};

export const verifyOTP = (phoneNumber, otp) => {
  const cleanPhoneNumber = phoneNumber.replace(/\s/g, "");

  const stored = otpStore.get(cleanPhoneNumber);

  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(cleanPhoneNumber);
    return false;
  }

  if (stored.otp !== otp) {
    return false;
  }

  otpStore.delete(cleanPhoneNumber);

  return true;
};
