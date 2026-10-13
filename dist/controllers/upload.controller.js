"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSignature = void 0;
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const env_1 = require("../config/env");
const uploadSignature = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, message: 'No signature image file provided.' });
            return;
        }
        const hasCloudinary = Boolean(env_1.ENV.CLOUDINARY_CLOUD_NAME &&
            env_1.ENV.CLOUDINARY_API_KEY &&
            env_1.ENV.CLOUDINARY_API_SECRET);
        if (hasCloudinary) {
            const uploadPromise = new Promise((resolve, reject) => {
                const stream = cloudinary_1.default.uploader.upload_stream({
                    folder: 'docpresc/signatures',
                    resource_type: 'image',
                    format: 'png',
                    transformation: [{ width: 600, crop: 'limit' }],
                }, (error, result) => {
                    if (error || !result) {
                        reject(error || new Error('Cloudinary upload failed.'));
                    }
                    else {
                        resolve({ secure_url: result.secure_url, public_id: result.public_id });
                    }
                });
                stream.end(req.file.buffer);
            });
            const result = await uploadPromise;
            res.json({
                success: true,
                message: 'Signature uploaded to Cloudinary successfully.',
                data: {
                    url: result.secure_url,
                    publicId: result.public_id,
                    provider: 'cloudinary',
                },
            });
            return;
        }
        // Fallback: Base64 data URI if Cloudinary credentials are not provided in .env yet
        const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        res.json({
            success: true,
            message: 'Signature processed successfully (Base64 fallback). Configure Cloudinary credentials in .env for cloud hosting.',
            data: {
                url: base64,
                provider: 'local_base64',
            },
        });
    }
    catch (error) {
        console.error('Signature upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload signature.',
        });
    }
};
exports.uploadSignature = uploadSignature;
