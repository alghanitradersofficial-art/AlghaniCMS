import { Router } from "express";
import multer from "multer";
import crypto from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

function cloudinarySignature(params: Record<string, string | number>) {
  const config = getCloudinaryConfig();
  if (!config) return "";
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("sha1").update(sorted + config.apiSecret).digest("hex");
}

router.post("/cloudinary", upload.single("file"), async (req, res) => {
  try {
    const config = getCloudinaryConfig();
    if (!config) return res.status(500).json({ error: "Cloudinary not configured" });
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = String(req.body.folder || "alghani");
    const signature = cloudinarySignature({ folder, timestamp, resource_type: "auto" });

    const formData = new FormData();
    formData.append("file", req.file.buffer as any, req.file.originalname);
    formData.append("api_key", config.apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
    formData.append("folder", folder);
    formData.append("resource_type", "auto");

    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, {
      method: "POST",
      body: formData,
    });
    const payload: any = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: payload?.error?.message || "Cloudinary upload failed" });
    }

    return res.json({
      url: payload.secure_url || payload.url,
      publicId: payload.public_id,
      filename: payload.original_filename,
      format: payload.format,
      bytes: payload.bytes,
      type: payload.resource_type,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Upload failed" });
  }
});

router.post("/cloudinary/destroy", async (req, res) => {
  try {
    const config = getCloudinaryConfig();
    if (!config) return res.status(500).json({ error: "Cloudinary not configured" });
    const { publicId } = req.body;
    if (!publicId) return res.status(400).json({ error: "publicId is required" });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinarySignature({ public_id: publicId, timestamp });
    const formData = new URLSearchParams();
    formData.append("public_id", publicId);
    formData.append("api_key", config.apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`, {
      method: "POST",
      body: formData,
    });
    const payload: any = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: payload?.error?.message || "Cloudinary delete failed" });
    }

    return res.json({ success: payload.result === "ok" || payload.result === "not found" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Destroy failed" });
  }
});

export default router;
