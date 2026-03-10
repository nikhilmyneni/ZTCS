const crypto = require('crypto');
const { User } = require('../models');
const { getRedis } = require('../config/database');
const { sendOTP } = require('../utils/email');
const { createAuditLog } = require('../middleware/auditLogger');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');

// ─── MULTI-STEP VERIFICATION HELPER ───
// Maps a completed method to the abstract requirement it satisfies
const METHOD_TO_REQUIREMENT = {
  otp: 'otp_or_totp',
  totp: 'otp_or_totp',
  secret_answer: 'secret_question',
};

/**
 * Check and update multi-step challenge progress.
 * Device-scoped: only affects the specific device session.
 * When all challenges pass, generates full access + refresh tokens.
 * Returns { allComplete, remaining, accessToken?, refreshToken? }
 */
const checkAndCompleteStepUp = async (userId, completedMethod, redis, deviceScope, options = {}) => {
  if (!redis) return { allComplete: true, remaining: [] };

  const scope = deviceScope || 'default';
  const pendingRaw = await redis.get(`stepup:pending:${userId}:${scope}`);
  if (!pendingRaw) {
    // No pending challenges — treat as complete
    await redis.setex(`stepup:verified:${userId}:${scope}`, 60 * 60, 'true');
    return { allComplete: true, remaining: [] };
  }

  let pendingData;
  try {
    pendingData = JSON.parse(pendingRaw);
  } catch {
    // Legacy string format ('true') — single method completes it
    await redis.setex(`stepup:verified:${userId}:${scope}`, 60 * 60, 'true');
    await redis.del(`stepup:pending:${userId}:${scope}`);
    return { allComplete: true, remaining: [] };
  }

  const { required = [], completedMethods = [] } = pendingData;

  // Add the satisfied requirement
  const satisfies = METHOD_TO_REQUIREMENT[completedMethod] || completedMethod;
  if (!completedMethods.includes(satisfies)) {
    completedMethods.push(satisfies);
  }

  // Check which requirements are still unmet
  const remaining = required.filter(r => !completedMethods.includes(r));

  if (remaining.length === 0) {
    // All challenges satisfied for this device
    await redis.setex(`stepup:verified:${userId}:${scope}`, 60 * 60, 'true');
    await redis.del(`stepup:pending:${userId}:${scope}`);
    // Clear bulk download tracking so user can continue normally
    await redis.del(`downloads:${userId}`);
    await redis.del(`bulk-alerted:${userId}`);
    // Reset risk cache to low for this device after successful verification
    const riskCache = await redis.get(`risk:${userId}:${scope}`);
    if (riskCache) {
      const risk = JSON.parse(riskCache);
      risk.score = Math.min(risk.score, 30);
      risk.level = 'low';
      risk.recommendation = 'allow';
      await redis.setex(`risk:${userId}:${scope}`, 60 * 15, JSON.stringify(risk));
    }

    // Issue full access + refresh tokens now that verification is complete
    const user = await User.findById(userId);
    const accessToken = generateAccessToken(user, scope);
    const refreshToken = generateRefreshToken(user);
    await redis.setex(`refresh:${userId}`, 7 * 24 * 60 * 60, refreshToken);
    // Clear any prior revocation — user has freshly re-authenticated via step-up
    await redis.del(`revoked:${userId}:${scope}`);

    // Update baseline profile now that identity is verified
    // SKIP baseline update when UEBA was unavailable — we can't trust the risk assessment,
    // so don't learn potentially malicious IPs/devices into the baseline
    const uebaWasDown = pendingData.uebaUnavailable === true;
    if (uebaWasDown) {
      console.warn(`⚠️ Skipping baseline update for user ${userId} — UEBA was unavailable during login`);
    }
    if (options.req && !uebaWasDown) {
      const baselineUpdate = {
        $inc: { 'baselineProfile.loginCount': 1 },
        $set: {
          'baselineProfile.lastLoginAt': new Date(),
          'baselineProfile.lastLoginIP': options.req.clientIP,
          'baselineProfile.lastLoginDevice': options.req.deviceFingerprint,
        },
        $addToSet: {},
      };
      if (options.req.clientIP) {
        baselineUpdate.$addToSet['baselineProfile.knownIPs'] = options.req.clientIP;
      }
      if (options.req.deviceFingerprint && options.req.deviceFingerprint !== 'unknown') {
        baselineUpdate.$addToSet['baselineProfile.knownDevices'] = options.req.deviceFingerprint;
      }
      if (options.req.deviceInfo?.os && options.req.deviceInfo.os !== 'Unknown') {
        baselineUpdate.$addToSet['baselineProfile.knownDeviceTypes'] = options.req.deviceInfo.os;
      }
      // Store geo data from the cached risk assessment so impossible travel works correctly
      const riskRaw = await redis.get(`risk:${userId}:${scope}`);
      if (riskRaw) {
        try {
          const riskData = JSON.parse(riskRaw);
          const geo = riskData.geo_info || riskData.geoInfo;
          if (geo && !geo.is_private && geo.country && geo.country !== 'Unknown') {
            baselineUpdate.$addToSet['baselineProfile.geoLocations'] = {
              city: geo.city,
              region: geo.region,
              country: geo.country,
              loc: geo.loc,
            };
          }
        } catch {}
      }
      // Clean up empty $addToSet
      if (Object.keys(baselineUpdate.$addToSet).length === 0) {
        delete baselineUpdate.$addToSet;
      }
      await User.findByIdAndUpdate(userId, baselineUpdate);
    }

    // Track this as an active session
    if (options.req) {
      const sessionData = {
        ipAddress: options.req.clientIP,
        userAgent: options.req.clientUserAgent,
        deviceInfo: options.req.deviceInfo || {},
        loginAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      };
      await redis.setex(`session:${userId}:${scope}`, 7 * 24 * 60 * 60, JSON.stringify(sessionData));
    }

    // Log login_success now that step-up is fully passed
    await createAuditLog({
      userId,
      action: 'login_success',
      ipAddress: options.req?.clientIP,
      details: { verifiedViaStepUp: true, method: completedMethod },
    });

    // If user opted to trust this device, store it for 30 days
    if (options.trustDevice && scope !== 'default') {
      await redis.setex(`trusted:${userId}:${scope}`, 30 * 24 * 60 * 60, JSON.stringify({
        trustedAt: new Date().toISOString(),
        method: completedMethod,
      }));

      // Notify admin about new trusted device
      if (options.req) {
        const io = options.req.app?.get('io');
        if (io) {
          io.to('admin-room').emit('login-event', {
            userId,
            email: user.email,
            name: user.name,
            riskScore: 0,
            riskLevel: 'low',
            action: 'device_trusted',
            deviceInfo: options.req.deviceInfo,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return { allComplete: true, remaining: [], accessToken, refreshToken };
  } else {
    // Partial — update completed list
    pendingData.completedMethods = completedMethods;
    await redis.setex(`stepup:pending:${userId}:${scope}`, 60 * 30, JSON.stringify(pendingData));
    return { allComplete: false, remaining };
  }
};

// ─── SEND OTP (Email) ───
const sendOTPEmail = async (req, res) => {
  try {
    const user = req.user;
    const redis = getRedis();

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store OTP in Redis with 5-minute expiry
    if (redis) {
      await redis.setex(`otp:${user._id}`, 300, otp);
      // Track attempts
      await redis.setex(`otp:attempts:${user._id}`, 300, '0');
    }

    // Send email
    await sendOTP(user.email, otp);

    console.log(`📧 OTP sent to ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email.',
      data: {
        method: 'email',
        expiresIn: 300, // 5 minutes
        email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // Mask email
      },
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code.',
    });
  }
};

// ─── VERIFY OTP ───
const verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = req.user;
    const redis = getRedis();

    if (!redis) {
      return res.status(500).json({ success: false, message: 'Verification service unavailable.' });
    }

    // Check attempts (max 5)
    const attempts = parseInt(await redis.get(`otp:attempts:${user._id}`) || '0');
    if (attempts >= 5) {
      await redis.del(`otp:${user._id}`);
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please request a new code.',
      });
    }

    // Get stored OTP
    const storedOTP = await redis.get(`otp:${user._id}`);
    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'Verification code expired. Please request a new one.',
      });
    }

    // Increment attempts
    await redis.incr(`otp:attempts:${user._id}`);

    // Compare
    if (otp !== storedOTP) {
      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${4 - attempts} attempts remaining.`,
      });
    }

    // ─── OTP Verified — Check multi-step progress ───
    await redis.del(`otp:${user._id}`);
    await redis.del(`otp:attempts:${user._id}`);

    const deviceScope = req.deviceFingerprint || 'default';
    const result = await checkAndCompleteStepUp(user._id, 'otp', redis, deviceScope, { trustDevice: req.body.trustDevice, req });

    if (result.allComplete) {
      await createAuditLog({
        userId: user._id,
        action: 'step_up_success',
        ipAddress: req.clientIP,
        details: { method: 'otp' },
      });
    }

    console.log(`✅ Step-up OTP verified for ${user.email} (allComplete: ${result.allComplete})`);

    const responseData = {
      method: 'otp', allComplete: result.allComplete, remaining: result.remaining,
      verifiedUntil: result.allComplete ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
    };
    if (result.allComplete && result.accessToken) {
      responseData.accessToken = result.accessToken;
      responseData.refreshToken = result.refreshToken;
    }

    res.status(200).json({
      success: true,
      message: result.allComplete ? 'Identity verified successfully.' : 'OTP verified. Additional verification required.',
      data: responseData,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
};

// ─── VERIFY SECRET ANSWER (Fallback) ───
const verifySecretAnswer = async (req, res) => {
  try {
    const { answer } = req.body;
    const user = await User.findById(req.user._id).select('+secretAnswer');
    const redis = getRedis();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await user.compareSecretAnswer(answer);

    if (!isMatch) {
      await createAuditLog({
        userId: user._id,
        action: 'step_up_failed',
        ipAddress: req.clientIP,
        details: { method: 'secret_answer', reason: 'Incorrect answer', deviceInfo: { os: req.deviceInfo?.os || 'Unknown', browser: req.deviceInfo?.browser || 'Unknown', deviceType: req.deviceInfo?.deviceType || 'Unknown' } },
        success: false,
      });
      return res.status(400).json({
        success: false,
        message: 'Incorrect answer. Please try again.',
      });
    }

    // ─── Verified — Check multi-step progress ───
    const deviceScope = req.deviceFingerprint || 'default';
    const result = await checkAndCompleteStepUp(user._id, 'secret_answer', redis, deviceScope, { trustDevice: req.body.trustDevice, req });

    if (result.allComplete) {
      await createAuditLog({
        userId: user._id,
        action: 'step_up_success',
        ipAddress: req.clientIP,
        details: { method: 'secret_answer' },
      });
    }

    console.log(`✅ Step-up secret answer verified for ${user.email} (allComplete: ${result.allComplete})`);

    const responseData = { method: 'secret_answer', allComplete: result.allComplete, remaining: result.remaining };
    if (result.allComplete && result.accessToken) {
      responseData.accessToken = result.accessToken;
      responseData.refreshToken = result.refreshToken;
    }

    res.status(200).json({
      success: true,
      message: result.allComplete ? 'Identity verified successfully.' : 'Security question verified. Additional verification required.',
      data: responseData,
    });
  } catch (error) {
    console.error('Verify secret answer error:', error);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
};

// ─── SETUP TOTP AUTHENTICATOR ───
const setupTOTP = async (req, res) => {
  try {
    const user = req.user;

    // Generate TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: 'ZTCS',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;
    const otpauthUrl = totp.toString();

    // Store secret (not yet enabled — user must verify first)
    await User.findByIdAndUpdate(user._id, {
      'totp.secret': secret,
    });

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.status(200).json({
      success: true,
      message: 'Scan this QR code with your authenticator app.',
      data: {
        qrCode: qrCodeDataUrl,
        secret, // Allow manual entry
        otpauthUrl,
      },
    });
  } catch (error) {
    console.error('TOTP setup error:', error);
    res.status(500).json({ success: false, message: 'Failed to setup authenticator.' });
  }
};

// ─── VERIFY & ENABLE TOTP ───
const verifyTOTP = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id).select('+totp.secret');
    const redis = getRedis();

    if (!user?.totp?.secret) {
      return res.status(400).json({
        success: false,
        message: 'Authenticator not set up. Please set up first.',
      });
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'ZTCS',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totp.secret),
    });

    // Verify with 1 period tolerance (30 sec window before/after)
    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      return res.status(400).json({
        success: false,
        message: 'Invalid authenticator code. Please try again.',
      });
    }

    // Enable TOTP if this is the first verification
    if (!user.totp.enabled) {
      await User.findByIdAndUpdate(user._id, {
        'totp.enabled': true,
        'totp.verifiedAt': new Date(),
      });
    }

    // Mark step-up — Check multi-step progress
    const deviceScope = req.deviceFingerprint || 'default';
    const result = await checkAndCompleteStepUp(user._id, 'totp', redis, deviceScope, { trustDevice: req.body.trustDevice, req });

    if (result.allComplete) {
      await createAuditLog({
        userId: user._id,
        action: 'step_up_success',
        ipAddress: req.clientIP,
        details: { method: 'totp' },
      });
    }

    console.log(`✅ Step-up TOTP verified for ${user.email} (allComplete: ${result.allComplete})`);

    const responseData = {
      method: 'totp',
      enabled: true,
      allComplete: result.allComplete,
      remaining: result.remaining,
    };
    if (result.allComplete && result.accessToken) {
      responseData.accessToken = result.accessToken;
      responseData.refreshToken = result.refreshToken;
    }

    res.status(200).json({
      success: true,
      message: result.allComplete ? 'Authenticator verified successfully.' : 'TOTP verified. Additional verification required.',
      data: responseData,
    });
  } catch (error) {
    console.error('TOTP verify error:', error);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
};

// ─── DISABLE TOTP ───
const disableTOTP = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    // Require password confirmation
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password.' });
    }

    await User.findByIdAndUpdate(user._id, {
      'totp.secret': null,
      'totp.enabled': false,
      'totp.verifiedAt': null,
    });

    res.status(200).json({
      success: true,
      message: 'Authenticator disabled.',
    });
  } catch (error) {
    console.error('Disable TOTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to disable authenticator.' });
  }
};

// ─── GET STEP-UP STATUS ───
const getStepUpStatus = async (req, res) => {
  try {
    const redis = getRedis();
    const user = req.user;
    const deviceScope = req.deviceFingerprint || 'default';

    let status = {
      required: false,
      verified: false,
      methods: ['otp', 'secret_answer'],
      secretQuestion: user.secretQuestion,
      requiredChallenges: [],
      completedMethods: [],
      remaining: [],
      challengeReason: '',
    };

    // Check if TOTP is enabled
    const fullUser = await User.findById(user._id).select('totp.enabled');
    if (fullUser?.totp?.enabled) {
      status.methods.unshift('totp'); // TOTP as preferred method
      status.totpEnabled = true;
    }

    if (redis) {
      // Check per-device step-up state
      const pending = await redis.get(`stepup:pending:${user._id}:${deviceScope}`);
      const verified = await redis.get(`stepup:verified:${user._id}:${deviceScope}`);
      status.required = !!pending;
      status.verified = !!verified;

      // Parse structured pending data for challenge info
      if (pending) {
        try {
          const pendingData = JSON.parse(pending);
          status.requiredChallenges = pendingData.required || [];
          status.completedMethods = pendingData.completedMethods || [];
          status.remaining = (pendingData.required || []).filter(
            r => !(pendingData.completedMethods || []).includes(r)
          );
          status.challengeReason = pendingData.reason || '';
        } catch {
          // Legacy string format
        }
      }
    }

    // Get current risk data for this device
    if (redis) {
      const riskCache = await redis.get(`risk:${user._id}:${deviceScope}`);
      if (riskCache) {
        const risk = JSON.parse(riskCache);
        status.riskScore = risk.score;
        status.riskLevel = risk.level;
      }
    }

    res.status(200).json({ success: true, data: status });
  } catch (error) {
    console.error('Step-up status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get status.' });
  }
};

module.exports = {
  sendOTPEmail,
  verifyOTP,
  verifySecretAnswer,
  setupTOTP,
  verifyTOTP,
  disableTOTP,
  getStepUpStatus,
};
