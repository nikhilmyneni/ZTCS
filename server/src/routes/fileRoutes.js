const express = require('express');
const multer = require('multer');
const { uploadFile, listFiles, downloadFile, deleteFile } = require('../controllers/fileController');
const { protect } = require('../middleware/auth');
const { accessGateway } = require('../middleware/accessGateway');

const router = express.Router();

// Multer config — store in memory (upload to Supabase from buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed.`), false);
    }
  },
});

// All routes require authentication
router.use(protect);

// GET /api/files — List user's files (low risk check via gateway)
router.get('/', accessGateway({ action: 'file_access' }), listFiles);

// POST /api/files/upload — Upload file
router.post(
  '/upload',
  accessGateway({ action: 'file_upload' }),
  upload.single('file'),
  uploadFile
);

// GET /api/files/:fileId/download — Download file
router.get(
  '/:fileId/download',
  accessGateway({ action: 'file_download' }),
  downloadFile
);

// DELETE /api/files/:fileId — Delete file
router.delete(
  '/:fileId',
  accessGateway({ action: 'file_delete' }),
  deleteFile
);

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10 MB.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.message?.includes('not allowed')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

module.exports = router;
