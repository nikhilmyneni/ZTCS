const { AuditLog } = require('../models');

/**
 * Create an audit log entry
 */
const createAuditLog = async ({
  userId,
  action,
  details = {},
  ipAddress,
  deviceFingerprint,
  userAgent,
  riskScore,
  riskLevel,
  success = true,
  sessionId,
}) => {
  try {
    const log = await AuditLog.create({
      userId,
      action,
      details,
      ipAddress,
      deviceFingerprint,
      userAgent,
      riskScore,
      riskLevel,
      success,
      sessionId,
    });
    return log;
  } catch (error) {
    console.error('Audit log creation failed:', error.message);
    return null;
  }
};

/**
 * Extract client IP from request (handles proxies, Render, Vercel, Cloudflare)
 */
const getClientIP = (req) => {
  return (
    req.headers['cf-connecting-ip'] ||                          // Cloudflare
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||   // Proxy / Load balancer
    req.headers['x-real-ip'] ||                                 // Nginx
    req.headers['x-client-ip'] ||                               // Some proxies
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};

/**
 * Parse user-agent into device type, browser, and OS
 */
const parseUserAgent = (ua) => {
  if (!ua || ua === 'unknown') return { deviceType: 'unknown', browser: 'unknown', os: 'unknown' };

  // Device type
  let deviceType = 'Desktop';
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) {
    deviceType = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';
  }

  // Browser
  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Opera|OPR/i.test(ua)) browser = 'Opera';
  else if (/MSIE|Trident/i.test(ua)) browser = 'IE';

  // OS
  let os = 'Unknown';
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { deviceType, browser, os };
};

/**
 * Express middleware to attach IP, device info, and parsed UA to request
 */
const attachClientInfo = (req, res, next) => {
  req.clientIP = getClientIP(req);
  req.deviceFingerprint = req.headers['x-device-fingerprint'] || null;
  req.clientUserAgent = req.headers['user-agent'] || 'unknown';
  req.deviceInfo = parseUserAgent(req.clientUserAgent);
  next();
};

module.exports = { createAuditLog, getClientIP, parseUserAgent, attachClientInfo };
