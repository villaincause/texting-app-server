import twilio from "twilio";
import { config } from "../config/env.js";

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

const otpStore = new Map();

const OTP_EXPIRY = 5 * 60 * 1000;

export const generateOTP = async (phoneNumber) => {
  const cleanPhoneNumber = phoneNumber.replace(/\s/g, "");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore.set(cleanPhoneNumber, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY,
  });

  await client.messages.create({
    body: `sms_2fa`,
    from: config.TWILIO_PHONE_NUMBER,
    to: cleanPhoneNumber,
  });

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
