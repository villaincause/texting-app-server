import {
  handleGenerateUploadSignature,
  handleUploadProfilePicture,
} from "../controllers/media.controller.js";

export const handleMediaRoutes = async (req, res) => {
  // Remove the query string, if one exists.
  const pathname = req.url.split("?")[0];

  // Generate Cloudinary upload signature
  if (pathname === "/api/media/signature" && req.method === "POST") {
    await handleGenerateUploadSignature(req, res);
    return true;
  }

  // Upload profile picture
  if (pathname === "/api/media/profile-picture" && req.method === "POST") {
    await handleUploadProfilePicture(req, res);
    return true;
  }

  return false;
};
