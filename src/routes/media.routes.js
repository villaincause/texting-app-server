import { handleGenerateUploadSignature } from "../controllers/media.controller.js";

export const handleMediaRoutes = async (req, res) => {
  if (req.url === "/api/media/signature" && req.method === "POST") {
    await handleGenerateUploadSignature(req, res);
    return true;
  }

  return false;
};
