const jwt = require('jsonwebtoken');

const generateAccessToken = (user, deviceFingerprint) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };
  // Bind token to device fingerprint if available (prevents token replay from different device)
  if (deviceFingerprint && deviceFingerprint !== 'default' && deviceFingerprint !== 'unknown') {
    payload.dfp = deviceFingerprint;
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/**
 * Generate a short-lived pending token for step-up verification.
 * This token only allows access to step-up routes, NOT full resources.
 */
const generatePendingToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      pending: true, // Marks this as a step-up-only token
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' } // Short-lived — user must verify within 10 minutes
  );
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generatePendingToken,
  verifyAccessToken,
  verifyRefreshToken,
};
