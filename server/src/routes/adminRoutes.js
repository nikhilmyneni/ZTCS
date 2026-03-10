const express = require('express');
const { body } = require('express-validator');
const {
  getDashboardStats,
  listUsers,
  toggleBlockUser,
  getIPList,
  addToIPList,
  removeFromIPList,
  getAuditLogs,
  exportAuditCSV,
  getUserRiskHistory,
  getAllRiskScores,
  getBlockedUsers,
  adminSendOTP,
  adminVerifyUnblock,
  dismissBlock,
  escalateBlock,
  resetUserTOTP,
  clearLoginStats,
  getGeoList,
  addToGeoList,
  removeFromGeoList,
} = require('../controllers/adminController');
const { protect, restrictTo, requireAdmin2FA } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// All admin routes require authentication + admin role + TOTP enabled
router.use(protect);
router.use(restrictTo('admin'));
router.use(requireAdmin2FA);

// GET /api/admin/stats — Dashboard overview stats
router.get('/stats', getDashboardStats);

// DELETE /api/admin/stats/logins — Clear all login records from stats
router.delete('/stats/logins', clearLoginStats);

// GET /api/admin/users — List all users with risk info
router.get('/users', listUsers);

// PATCH /api/admin/users/:userId/toggle-block — Block/unblock user
router.patch('/users/:userId/toggle-block', toggleBlockUser);

// PATCH /api/admin/users/:userId/reset-totp — Reset user's authenticator
router.patch('/users/:userId/reset-totp', resetUserTOTP);

// GET /api/admin/users/:userId/risk-history — User's risk score timeline
router.get('/users/:userId/risk-history', getUserRiskHistory);

// IP Controls
router.get('/ip-list', getIPList);
router.post(
  '/ip-list/add',
  [
    body('ip').trim().notEmpty().withMessage('IP address is required'),
    body('listType').isIn(['blacklist', 'whitelist']).withMessage('Invalid list type'),
  ],
  validate,
  addToIPList
);
router.post(
  '/ip-list/remove',
  [
    body('ip').trim().notEmpty().withMessage('IP address is required'),
    body('listType').isIn(['blacklist', 'whitelist']).withMessage('Invalid list type'),
  ],
  validate,
  removeFromIPList
);

// Geo-Restriction (Country Allow/Deny)
router.get('/geo-list', getGeoList);
router.post(
  '/geo-list/add',
  [
    body('country').trim().notEmpty().withMessage('Country code is required'),
    body('listType').isIn(['blocklist', 'allowlist']).withMessage('Invalid list type'),
  ],
  validate,
  addToGeoList
);
router.post(
  '/geo-list/remove',
  [
    body('country').trim().notEmpty().withMessage('Country code is required'),
    body('listType').isIn(['blocklist', 'allowlist']).withMessage('Invalid list type'),
  ],
  validate,
  removeFromGeoList
);

// Audit Logs
router.get('/audit-logs', getAuditLogs);
router.get('/audit-logs/export', exportAuditCSV);

// Risk Scores (all sessions for graph)
router.get('/risk-scores', getAllRiskScores);

// Action Center — Blocked users management (requires OTP + TOTP to unblock)
router.get('/action-center/blocked', getBlockedUsers);
router.post('/action-center/send-otp', adminSendOTP);
router.post(
  '/action-center/verify-unblock',
  [
    body('userId').trim().notEmpty().withMessage('User ID is required'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    body('totpCode').trim().notEmpty().withMessage('TOTP code is required'),
  ],
  validate,
  adminVerifyUnblock
);
router.post(
  '/action-center/dismiss',
  [body('userId').trim().notEmpty().withMessage('User ID is required')],
  validate,
  dismissBlock
);
router.post(
  '/action-center/escalate',
  [body('userId').trim().notEmpty().withMessage('User ID is required')],
  validate,
  escalateBlock
);

module.exports = router;
