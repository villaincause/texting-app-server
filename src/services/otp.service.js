// In-memory store: phone_number -> { code, expiresAt }
const otpStore = new Map();

export function generateOTP(phoneNumber) {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

  otpStore.set(phoneNumber, { code, expiresAt });
  
  // Console log for local dev / testing
  console.log(`[OTP Generated] Phone: ${phoneNumber} | Code: ${code}`);
  return code;
}

export function verifyOTP(phoneNumber, code) {
  const record = otpStore.get(phoneNumber);
  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phoneNumber);
    return false;
  }

  if (record.code === code) {
    otpStore.delete(phoneNumber); // Single use
    return true;
  }

  return false;
}