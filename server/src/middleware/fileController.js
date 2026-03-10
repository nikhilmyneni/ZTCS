const { File, AuditLog } = require('../models');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { createAuditLog } = require('../middleware/auditLogger');
const { getRedis } = require('../config/database');
const { sendBulkDownloadAlert } = require('../utils/email');

// ─── UPLOAD FILE ───
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided.' });
    }

    const user = req.user;
    const file = req.file;

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file.buffer, {
      public_id: `${user._id}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      resource_type: 'auto',
    });

    // Save metadata to MongoDB
    const fileDoc = await File.create({
      userId: user._id,
      originalName: file.originalname,
      cloudinaryId: result.public_id,
      cloudinaryUrl: result.secure_url,
      format: result.format,
      sizeBytes: result.bytes,
      resourceType: result.resource_type,
      mimeType: file.mimetype,
    });

    // Audit log
    await createAuditLog({
      userId: user._id,
      action: 'file_upload',
      ipAddress: req.clientIP,
      deviceFingerprint: req.deviceFingerprint,
      riskScore: req.riskData?.score,
      riskLevel: req.riskData?.level,
      details: {
        fileId: fileDoc._id,
        fileName: file.originalname,
        fileSize: result.bytes,
        format: result.format,
      },
    });

    console.log(`📁 File uploaded: ${file.originalname} by ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully.',
      data: {
        file: {
          id: fileDoc._id,
          name: fileDoc.originalName,
          url: fileDoc.cloudinaryUrl,
          size: fileDoc.sizeBytes,
          format: fileDoc.format,
          uploadedAt: fileDoc.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'File upload failed.' });
  }
};

// ─── LIST USER FILES ───
const listFiles = async (req, res) => {
  try {
    const files = await File.find({
      userId: req.user._id,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .select('originalName cloudinaryUrl format sizeBytes resourceType downloadCount createdAt isRestricted');

    res.status(200).json({
      success: true,
      data: {
        files: files.map((f) => ({
          id: f._id,
          name: f.originalName,
          url: f.cloudinaryUrl,
          format: f.format,
          size: f.sizeBytes,
          type: f.resourceType,
          downloads: f.downloadCount,
          restricted: f.isRestricted,
          uploadedAt: f.createdAt,
        })),
        count: files.length,
      },
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve files.' });
  }
};

// ─── DOWNLOAD FILE ───
const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const user = req.user;

    const file = await File.findOne({
      _id: fileId,
      userId: user._id,
      isDeleted: false,
    });

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    // Check if file is restricted
    if (file.isRestricted) {
      await createAuditLog({
        userId: user._id,
        action: 'restricted_access_attempt',
        ipAddress: req.clientIP,
        riskScore: req.riskData?.score,
        riskLevel: req.riskData?.level,
        details: { fileId: file._id, fileName: file.originalName },
        success: false,
      });

      return res.status(403).json({
        success: false,
        message: 'This file is restricted. Contact admin.',
      });
    }

    // ─── Bulk download detection ───
    const redis = getRedis();
    if (redis) {
      const downloadKey = `downloads:${user._id}`;
      const recentDownloads = await redis.incr(downloadKey);
      if (recentDownloads === 1) {
        await redis.expire(downloadKey, 300); // 5 min window
      }

      if (recentDownloads > 10) {
        // More than 10 downloads in 5 minutes = suspicious
        await createAuditLog({
          userId: user._id,
          action: 'bulk_download_detected',
          ipAddress: req.clientIP,
          riskScore: req.riskData?.score,
          riskLevel: 'medium',
          details: {
            downloadCount: recentDownloads,
            windowMinutes: 5,
            fileId: file._id,
          },
        });

        // Bump risk score in cache
        const riskCache = await redis.get(`risk:${user._id}`);
        if (riskCache) {
          const risk = JSON.parse(riskCache);
          risk.score = Math.min(risk.score + 20, 115); // Add 20 for bulk behavior
          risk.level = risk.score <= 30 ? 'low' : risk.score <= 60 ? 'medium' : 'high';
          await redis.setex(`risk:${user._id}`, 60 * 15, JSON.stringify(risk));
        }

        console.log(`⚠️ Bulk download detected: ${user.email} — ${recentDownloads} downloads in 5 min`);

        // Emit event for admin
        const io = req.app.get('io');
        if (io) {
          io.to('admin-room').emit('bulk-download', {
            userId: user._id,
            email: user.email,
            downloadCount: recentDownloads,
            timestamp: new Date().toISOString(),
          });

          // Alert popup
          io.to('admin-room').emit('security-alert', {
            type: 'warning',
            title: 'Bulk Download Detected',
            message: `${user.email} — ${recentDownloads} files in 5 minutes`,
            email: user.email,
            timestamp: new Date().toISOString(),
          });
        }

        // Email alert
        sendBulkDownloadAlert(user.email, recentDownloads)
          .catch(err => console.error('Bulk download email failed:', err.message));
      }
    }

    // Update file metadata
    await File.findByIdAndUpdate(file._id, {
      $inc: { downloadCount: 1 },
      lastAccessedAt: new Date(),
      lastAccessedBy: user._id,
    });

    // Audit log
    await createAuditLog({
      userId: user._id,
      action: 'file_download',
      ipAddress: req.clientIP,
      riskScore: req.riskData?.score,
      riskLevel: req.riskData?.level,
      details: { fileId: file._id, fileName: file.originalName },
    });

    res.status(200).json({
      success: true,
      data: {
        url: file.cloudinaryUrl,
        name: file.originalName,
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, message: 'File download failed.' });
  }
};

// ─── DELETE FILE ───
const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const user = req.user;

    const file = await File.findOne({
      _id: fileId,
      userId: user._id,
      isDeleted: false,
    });

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    // Delete from Cloudinary
    try {
      await deleteFromCloudinary(file.cloudinaryId, file.resourceType);
    } catch (cloudErr) {
      console.error('Cloudinary delete warning:', cloudErr.message);
      // Continue anyway — mark as deleted in DB
    }

    // Soft delete in MongoDB
    await File.findByIdAndUpdate(file._id, { isDeleted: true });

    // Audit log
    await createAuditLog({
      userId: user._id,
      action: 'file_delete',
      ipAddress: req.clientIP,
      riskScore: req.riskData?.score,
      riskLevel: req.riskData?.level,
      details: { fileId: file._id, fileName: file.originalName },
    });

    console.log(`🗑️ File deleted: ${file.originalName} by ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully.',
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ success: false, message: 'File deletion failed.' });
  }
};

module.exports = { uploadFile, listFiles, downloadFile, deleteFile };
