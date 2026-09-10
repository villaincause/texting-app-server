import twilio from "twilio";
import { config } from "../config/env.js";

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

const otpStore = new Map();

const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes

export const generateOTP = async (phoneNumber) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore.set(phoneNumber, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY,
  });

  await client.messages.create({
    body: `Your Texting App verification code is: ${otp}`,
    from: config.TWILIO_PHONE_NUMBER,
    to: phoneNumber,
  });

  return true;
};

export const verifyOTP = (phoneNumber, otp) => {
  const stored = otpStore.get(phoneNumber);

  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phoneNumber);
    return false;
  }

  if (stored.otp !== otp) {
    return false;
  }

  otpStore.delete(phoneNumber);

  return true;
};
