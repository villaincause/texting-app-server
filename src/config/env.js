import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_CONNECT_STRING: process.env.DB_CONNECT_STRING,
  JWT_SECRET: process.env.JWT_SECRET || "default_secret",
  BULKSMSBD_API_KEY: process.env.BULKSMSBD_API_KEY,
  BULKSMSBD_SENDER_ID: process.env.BULKSMSBD_SENDER_ID,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
};
