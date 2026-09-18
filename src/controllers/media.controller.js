import cloudinary from "../config/cloudinary.js";
import { config } from "../config/env.js";

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
        message: "Failed to generate upload signature",
      }),
    );
  }
};
