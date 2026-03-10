const { verifyAccessToken } = require('../utils/jwt');
const { User } = require('../models');
const { getRedis } = require('../config/database');

/**
 * Protect routes — require valid JWT (rejects pending step-up tokens)
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated. Please log in.',
      });
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Reject pending tokens — they can only be used on step-up routes
    if (decoded.pending) {
      return res.status(403).json({
        success: false,
        message: 'Step-up verification required before accessing resources.',
        code: 'STEP_UP_PENDING',
      });
    }

    // Check if user still exists & is not blocked
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Contact admin.',
      });
    }

    // Check if this device's session has been revoked
    const redis = getRedis();
    const deviceScope = req.deviceFingerprint || req.headers['x-device-fingerprint'] || 'default';
    if (redis && deviceScope !== 'default') {
      const isRevoked = await redis.get(`revoked:${user._id}:${deviceScope}`);
      if (isRevoked) {
        return res.status(401).json({
          success: false,
          message: 'Session has been revoked. Please log in again.',
          code: 'SESSION_REVOKED',
        });
      }
    }

    // ─── Idle Session Timeout (Cloudflare Zero Trust concept) ───
    // If a session has been inactive for too long, force re-authentication
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    if (redis && deviceScope !== 'default') {
      const sessionRaw = await redis.get(`session:${user._id}:${deviceScope}`);
      if (sessionRaw) {
        try {
          const session = JSON.parse(sessionRaw);
          if (session.lastActive) {
            const idleMs = Date.now() - new Date(session.lastActive).getTime();
            if (idleMs > IDLE_TIMEOUT_MS) {
              // Clean up the stale session
              await redis.del(`session:${user._id}:${deviceScope}`);
              return res.status(401).json({
                success: false,
                message: 'Session expired due to inactivity. Please log in again.',
                code: 'SESSION_IDLE',
              });
            }
          }
        } catch {}
      }
    }

    // ─── Token-to-Device Binding (Cloudflare Zero Trust concept) ───
    // If token was bound to a device fingerprint at login, verify it matches
    if (decoded.dfp && deviceScope !== 'default') {
      if (decoded.dfp !== deviceScope) {
        return res.status(401).json({
          success: false,
          message: 'Token was issued for a different device. Please log in again.',
          code: 'TOKEN_DEVICE_MISMATCH',
        });
      }
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please refresh.',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }
};

/**
 * Protect step-up routes — accepts BOTH full tokens AND pending tokens.
 * Used only on step-up verification endpoints.
 */
const protectPending = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Account blocked.' });
    }

    // Check if this device's session has been revoked
    const redis = getRedis();
    const deviceScope = req.deviceFingerprint || req.headers['x-device-fingerprint'] || 'default';
    if (redis && deviceScope !== 'default') {
      const isRevoked = await redis.get(`revoked:${user._id}:${deviceScope}`);
      if (isRevoked) {
        return res.status(401).json({
          success: false,
          message: 'Session has been revoked. Please log in again.',
          code: 'SESSION_REVOKED',
        });
      }
    }

    req.user = user;
    req.userId = user._id;
    req.isPendingToken = !!decoded.pending;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Verification session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

/**
 * Restrict to specific roles
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};

/**
 * Require admin accounts to have TOTP enabled.
 * Blocks admin routes if the admin hasn't set up their authenticator.
 * Use AFTER protect + restrictTo('admin').
 */
const requireAdmin2FA = async (req, res, next) => {
  if (req.user.role !== 'admin') return next();

  const fullUser = await User.findById(req.user._id).select('totp.enabled');
  if (!fullUser?.totp?.enabled) {
    return res.status(403).json({
      success: false,
      message: 'Admin accounts must have TOTP authenticator enabled. Please set up 2FA first.',
      code: 'ADMIN_2FA_REQUIRED',
    });
  }
  next();
};

module.exports = { protect, protectPending, restrictTo, requireAdmin2FA };
