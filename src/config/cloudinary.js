import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a file buffer or stream directly to Cloudinary.
 * @param {Buffer} fileBuffer - The file buffer provided by multer memoryStorage
 * @param {string} fileName - Original name of the uploaded file
 * @param {string} folder - Destination folder in Cloudinary
 */
export async function uploadToCloudinary(fileBuffer, fileName, folder = 'chat_app') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        use_filename: true,
        public_id: `${Date.now()}_${fileName.replace(/\.[^/.]+$/, '')}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

export default cloudinary;