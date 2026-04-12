const { File, AuditLog } = require('../models');
const { uploadToSupabase, deleteFromSupabase, downloadFromSupabase, getSignedUrl } = require('../config/supabase');
const { createAuditLog } = require('../middleware/auditLogger');
const { getRedis } = require('../config/database');
const { sendBulkDownloadAlert } = require('../utils/email');
const { encryptBuffer, decryptBuffer } = require('../utils/encryption');

const getResourceType = (mime) => {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('document')) return 'document';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'spreadsheet';
  if (mime.includes('zip') || mime.includes('archive')) return 'archive';
  return 'other';
};

// ─── UPLOAD FILE ───
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided.' });
    }

    const user = req.user;
    const file = req.file;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user._id}/${Date.now()}_${safeName}`;
    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';

    // Encrypt file before uploading
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    let uploadBuffer = file.buffer;
    let encryptionMeta = {};

    if (masterKey) {
      const encrypted = encryptBuffer(file.buffer, masterKey);
      uploadBuffer = encrypted.encryptedBuffer;
      encryptionMeta = {
        algorithm: encrypted.algorithm,
        iv: encrypted.iv,
        salt: encrypted.salt,
        authTag: encrypted.authTag,
        encrypted: true,
      };
    }

    // Upload to Supabase Storage (encrypted if key is set)
    const result = await uploadToSupabase(uploadBuffer, storagePath, 'application/octet-stream');

    // Save metadata to MongoDB
    const fileDoc = await File.create({
      userId: user._id,
      originalName: file.originalname,
      storagePath: result.path,
      publicUrl: result.publicUrl,
      format: ext,
      sizeBytes: file.size,
      resourceType: getResourceType(file.mimetype),
      mimeType: file.mimetype,
      ...(encryptionMeta.encrypted && { encryption: encryptionMeta }),
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
        fileSize: file.size,
        format: ext,
      },
    });

    console.log(`File uploaded: ${file.originalname} by ${user.email}`);

    // Emit risk update for admin graph
    const io = req.app.get('io');
    if (io && req.riskData) {
      io.to('admin-room').emit('risk-update', {
        userId: user._id,
        email: user.email,
        riskScore: req.riskData.score,
        riskLevel: req.riskData.level,
        action: 'file_upload',
        details: file.originalname,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully.',
      data: {
        file: {
          id: fileDoc._id,
          name: fileDoc.originalName,
          url: fileDoc.publicUrl,
          size: fileDoc.sizeBytes,
          format: fileDoc.format,
          type: fileDoc.resourceType,
          encrypted: fileDoc.encryption?.encrypted || false,
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
      .select('originalName publicUrl format sizeBytes resourceType mimeType downloadCount createdAt isRestricted encryption.encrypted');

    res.status(200).json({
      success: true,
      data: {
        files: files.map((f) => ({
          id: f._id,
          name: f.originalName,
          url: f.publicUrl,
          format: f.format,
          size: f.sizeBytes,
          type: f.resourceType,
          mime: f.mimeType,
          downloads: f.downloadCount,
          restricted: f.isRestricted,
          encrypted: f.encryption?.encrypted || false,
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
    const inline = req.query.inline === '1';

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

    // Bulk download detection (skip for inline preview requests)
    const redis = getRedis();
    if (redis && !inline) {
      const downloadKey = `downloads:${user._id}`;
      const recentDownloads = await redis.incr(downloadKey);
      if (recentDownloads === 1) {
        await redis.expire(downloadKey, 300);
      }

      if (recentDownloads > 10) {
        // Check if bulk alert was already sent in this window (prevent duplicates)
        const bulkAlerted = await redis.get(`bulk-alerted:${user._id}`);
        // Check if user already completed step-up for bulk download
        const stepUpVerified = await redis.get(`stepup:verified:${user._id}`);

        if (!bulkAlerted) {
          // First time crossing threshold — trigger once
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

          // Update risk cache (don't delete it — update in place)
          const riskCache = await redis.get(`risk:${user._id}`);
          if (riskCache) {
            const risk = JSON.parse(riskCache);
            risk.score = Math.min(risk.score + 20, 100);
            risk.level = risk.score <= 30 ? 'low' : risk.score <= 60 ? 'medium' : 'high';
            risk.required_challenges = ['otp_or_totp'];
            risk.challenge_reason = 'Bulk download detected';
            await redis.setex(`risk:${user._id}`, 60 * 15, JSON.stringify(risk));
          }

          // Set step-up pending only if not already verified
          if (!stepUpVerified) {
            await redis.setex(
              `stepup:pending:${user._id}`,
              60 * 30,
              JSON.stringify({
                required: ['otp_or_totp'],
                reason: 'Bulk download detected',
                completedMethods: [],
              })
            );
          }

          // Mark that bulk alert has been sent for this window (5 min TTL)
          await redis.setex(`bulk-alerted:${user._id}`, 300, 'true');

          console.log(`Bulk download detected: ${user.email} - ${recentDownloads} downloads in 5 min`);

          const io = req.app.get('io');
          if (io) {
            io.to('admin-room').emit('bulk-download', {
              userId: user._id,
              email: user.email,
              downloadCount: recentDownloads,
              riskScore: req.riskData?.score || 0,
              riskLevel: req.riskData?.level || 'medium',
              timestamp: new Date().toISOString(),
            });
            io.to('admin-room').emit('security-alert', {
              type: 'warning',
              title: 'Bulk Download Detected',
              message: `${user.email} - ${recentDownloads} files in 5 minutes`,
              email: user.email,
              timestamp: new Date().toISOString(),
            });
          }

          sendBulkDownloadAlert(user.email, recentDownloads)
            .catch(err => console.error('Bulk download email failed:', err.message));
        }
        // If step-up already verified, allow download to proceed normally
      }
    }

    if (!inline) {
      await File.findByIdAndUpdate(file._id, {
        $inc: { downloadCount: 1 },
        lastAccessedAt: new Date(),
        lastAccessedBy: user._id,
      });

      await createAuditLog({
        userId: user._id,
        action: 'file_download',
        ipAddress: req.clientIP,
        riskScore: req.riskData?.score,
        riskLevel: req.riskData?.level,
        details: { fileId: file._id, fileName: file.originalName },
      });

      const io2 = req.app.get('io');
      if (io2 && req.riskData) {
        io2.to('admin-room').emit('risk-update', {
          userId: user._id,
          email: user.email,
          riskScore: req.riskData.score,
          riskLevel: req.riskData.level,
          action: 'file_download',
          details: file.originalName,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Encrypted files: download from Supabase, decrypt, stream back
    if (file.encryption?.encrypted) {
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        return res.status(500).json({ success: false, message: 'Decryption key not configured.' });
      }

      const encryptedData = await downloadFromSupabase(file.storagePath);
      const decryptedBuffer = decryptBuffer(
        encryptedData,
        masterKey,
        file.encryption.iv,
        file.encryption.salt,
        file.encryption.authTag
      );

      res.set({
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`,
        'Content-Length': decryptedBuffer.length,
      });
      return res.send(decryptedBuffer);
    }

    // Unencrypted files (legacy): return signed URL
    let downloadUrl = file.publicUrl;
    try {
      downloadUrl = await getSignedUrl(file.storagePath, 3600);
    } catch {
      // Fallback to public URL
    }

    res.status(200).json({
      success: true,
      data: {
        url: downloadUrl,
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

    // Delete from Supabase Storage
    try {
      await deleteFromSupabase(file.storagePath);
    } catch (storageErr) {
      console.error('Storage delete warning:', storageErr.message);
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

    console.log(`File deleted: ${file.originalName} by ${user.email}`);

    // Emit risk update for admin graph
    const io = req.app.get('io');
    if (io && req.riskData) {
      io.to('admin-room').emit('risk-update', {
        userId: user._id,
        email: user.email,
        riskScore: req.riskData.score,
        riskLevel: req.riskData.level,
        action: 'file_delete',
        details: file.originalName,
        timestamp: new Date().toISOString(),
      });
    }

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
