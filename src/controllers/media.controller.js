import cloudinary from "../config/cloudinary.js";
import { config } from "../config/env.js";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Existing Cloudinary signature endpoint.
export const handleGenerateUploadSignature = async (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "texting-app";

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
      },
      config.CLOUDINARY_API_SECRET,
    );

    res.writeHead(200);

    return res.end(
      JSON.stringify({
        success: true,
        cloudName: config.CLOUDINARY_CLOUD_NAME,
        apiKey: config.CLOUDINARY_API_KEY,
        timestamp,
        folder,
        signature,
      }),
    );
  } catch (error) {
    console.error("Cloudinary signature error:", error);

    res.writeHead(500);

    return res.end(
      JSON.stringify({
        success: false,
        message: "Failed to generate upload signature.",
      }),
    );
  }
};

// Upload a profile picture from a Base64 JSON request.
export const handleUploadProfilePicture = async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};

    if (!image || typeof image !== "string") {
      res.writeHead(400);

      return res.end(
        JSON.stringify({
          success: false,
          message: "Image data is required.",
        }),
      );
    }

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      res.writeHead(400);

      return res.end(
        JSON.stringify({
          success: false,
          message: "Only JPEG, PNG, and WebP images are supported.",
        }),
      );
    }

    // Reject malformed Base64 rather than passing arbitrary data to Cloudinary.
    const base64Pattern =
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    if (!base64Pattern.test(image)) {
      res.writeHead(400);

      return res.end(
        JSON.stringify({
          success: false,
          message: "Invalid image data.",
        }),
      );
    }

    const imageBuffer = Buffer.from(image, "base64");

    if (!imageBuffer.length) {
      res.writeHead(400);

      return res.end(
        JSON.stringify({
          success: false,
          message: "The image is empty.",
        }),
      );
    }

    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      res.writeHead(413);

      return res.end(
        JSON.stringify({
          success: false,
          message: "Image must be 5 MB or smaller.",
        }),
      );
    }

    // Upload the image to Cloudinary through the backend.
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "texting-app",
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result?.secure_url) {
            reject(new Error("Cloudinary did not return an image URL."));
            return;
          }

          resolve(result);
        },
      );

      uploadStream.on("error", reject);
      uploadStream.end(imageBuffer);
    });

    res.writeHead(200);

    return res.end(
      JSON.stringify({
        success: true,
        secure_url: uploadResult.secure_url,
      }),
    );
  } catch (error) {
    console.error("Profile picture upload error:", error);

    if (!res.headersSent) {
      res.writeHead(500);

      return res.end(
        JSON.stringify({
          success: false,
          message: "Failed to upload profile picture.",
        }),
      );
    }
  }
};
