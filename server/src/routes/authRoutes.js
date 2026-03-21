const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getLoginHistory,
  getTrustedDevices,
  revokeDeviceTrust,
  getActiveSessions,
  revokeSession,
  getActivityTimeline,
  getMyRiskScores,
  getActivitySummary,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('secretQuestion').trim().notEmpty().withMessage('Secret question is required'),
    body('secretAnswer').trim().notEmpty().withMessage('Secret answer is required'),
  ],
  validate,
  register
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  validate,
  refreshToken
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  forgotPassword
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validate,
  resetPassword
);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

// PATCH /api/auth/profile
router.patch(
  '/profile',
  protect,
  [body('name').optional().trim().notEmpty()],
  validate,
  updateProfile
);

// PATCH /api/auth/change-password
router.patch(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validate,
  changePassword
);

// GET /api/auth/my-risk-scores
router.get('/my-risk-scores', protect, getMyRiskScores);

// GET /api/auth/activity-timeline
router.get('/activity-timeline', protect, getActivityTimeline);

// GET /api/auth/activity-summary
router.get('/activity-summary', protect, getActivitySummary);

// GET /api/auth/login-history
router.get('/login-history', protect, getLoginHistory);

// GET /api/auth/trusted-devices
router.get('/trusted-devices', protect, getTrustedDevices);

// DELETE /api/auth/trusted-devices/:fingerprint — Revoke device trust
router.delete('/trusted-devices/:fingerprint', protect, revokeDeviceTrust);

// GET /api/auth/sessions — Active sessions
router.get('/sessions', protect, getActiveSessions);

// DELETE /api/auth/sessions/:fingerprint — Remote logout
router.delete('/sessions/:fingerprint', protect, revokeSession);

module.exports = router;
