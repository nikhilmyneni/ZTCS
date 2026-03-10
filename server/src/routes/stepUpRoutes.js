const express = require('express');
const { body } = require('express-validator');
const {
  sendOTPEmail,
  verifyOTP,
  verifySecretAnswer,
  setupTOTP,
  verifyTOTP,
  disableTOTP,
  getStepUpStatus,
} = require('../controllers/stepUpController');
const { protect, protectPending } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// Step-up verification routes accept BOTH full and pending tokens
// (so users can verify before being fully logged in)
router.use(protectPending);

// GET /api/stepup/status — Check if step-up is needed
router.get('/status', getStepUpStatus);

// POST /api/stepup/otp/send — Send OTP to email
router.post('/otp/send', sendOTPEmail);

// POST /api/stepup/otp/verify — Verify OTP code
router.post(
  '/otp/verify',
  [body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter a 6-digit code')],
  validate,
  verifyOTP
);

// POST /api/stepup/secret/verify — Verify secret answer
router.post(
  '/secret/verify',
  [body('answer').trim().notEmpty().withMessage('Answer is required')],
  validate,
  verifySecretAnswer
);

// POST /api/stepup/totp/setup — Generate TOTP secret & QR code
router.post('/totp/setup', setupTOTP);

// POST /api/stepup/totp/verify — Verify TOTP code (also enables it on first use)
router.post(
  '/totp/verify',
  [body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter a 6-digit code')],
  validate,
  verifyTOTP
);

// POST /api/stepup/totp/disable — Disable TOTP (requires password)
router.post(
  '/totp/disable',
  [body('password').notEmpty().withMessage('Password is required')],
  validate,
  disableTOTP
);

module.exports = router;
