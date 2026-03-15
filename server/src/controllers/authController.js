const crypto = require('crypto');
const { User, AuditLog } = require('../models');
const { generateAccessToken, generateRefreshToken, generatePendingToken, verifyRefreshToken } = require('../utils/jwt');
const { createAuditLog } = require('../middleware/auditLogger');
const { getRedis } = require('../config/database');
const { analyzeUserBehavior } = require('../services/uebaService');
const { sendHighRiskAlert, sendMediumRiskAlert, sendNewCountryAlert, sendPasswordResetEmail, sendAutoBlockAlert, sendSessionRevokedAlert, sendUEBADownAlert, sendAccountLockedAlert } = require('../utils/email');

// ─── Helper: Track active session in Redis ───
const trackSession = async (redis, userId, req) => {
  if (!redis) return;
  const deviceScope = req.deviceFingerprint || 'default';
  const sessionData = {
    ipAddress: req.clientIP,
    userAgent: req.clientUserAgent,
    deviceInfo: req.deviceInfo || {},
    geoInfo: null, // populated below if available
    loginAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
  // 7-day session TTL (matches refresh token)
  await redis.setex(`session:${userId}:${deviceScope}`, 7 * 24 * 60 * 60, JSON.stringify(sessionData));
};

// ─── Helper: Track failed login attempts (account lockout) ───
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION = 15 * 60; // 15 minutes in seconds
const FAIL_WINDOW = 15 * 60; // count failures within 15 min window

const _trackFailedLogin = async (redis, email, req) => {
  const failKey = `loginFail:${email}`;
  const lockKey = `loginLock:${email}`;

  const attempts = await redis.incr(failKey);
  if (attempts === 1) {
    await redis.expire(failKey, FAIL_WINDOW);
  }

  if (attempts >= LOCKOUT_THRESHOLD) {
    await redis.setex(lockKey, LOCKOUT_DURATION, 'true');
    await redis.del(failKey);
    await createAuditLog({
      userId: null,
      action: 'account_locked',
      ipAddress: req.clientIP,
      userAgent: req.clientUserAgent,
      details: { email, reason: `${LOCKOUT_THRESHOLD} failed login attempts`, lockDuration: '15 minutes' },
    }).catch(() => {});
    return true; // locked
  }
  return false;
};

// ─── REGISTER ───
const register = async (req, res) => {
  try {
    const { email, password, name, secretQuestion, secretAnswer } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const user = await User.create({
      email,
      password,
      name,
      secretQuestion,
      secretAnswer,
    });

    // Populate baseline profile at registration
    const deviceType = req.deviceInfo?.os || 'Unknown';
    const baselineUpdate = {
      $set: {
        'baselineProfile.lastLoginIP': req.clientIP,
        'baselineProfile.lastLoginDevice': req.deviceFingerprint,
        'baselineProfile.lastLoginAt': new Date(),
      },
      $addToSet: {
        'baselineProfile.knownIPs': req.clientIP,
        'baselineProfile.knownDeviceTypes': deviceType,
      },
    };

    // Only store valid fingerprints in baseline (never null/unknown)
    if (req.deviceFingerprint && req.deviceFingerprint !== 'unknown') {
      baselineUpdate.$addToSet['baselineProfile.knownDevices'] = req.deviceFingerprint;
    }

    // Try to resolve geo location for registration IP
    try {
      const { default: axios } = require('axios');
      const UEBA_BASE_URL = process.env.UEBA_SERVICE_URL || 'http://localhost:8000';
      const geoRes = await axios.get(`${UEBA_BASE_URL}/api/ueba/geoip/${req.clientIP}`, { timeout: 3000 }).catch(() => null);
      if (geoRes?.data && !geoRes.data.is_private) {
        baselineUpdate.$addToSet['baselineProfile.geoLocations'] = {
          city: geoRes.data.city,
          region: geoRes.data.region,
          country: geoRes.data.country,
          loc: geoRes.data.loc,
        };
      }
    } catch (geoErr) {
      // Non-critical — skip geo on registration
    }

    await User.findByIdAndUpdate(user._id, baselineUpdate);

    const accessToken = generateAccessToken(user, req.deviceFingerprint);
    const refreshToken = generateRefreshToken(user);

    const redis = getRedis();
    if (redis) {
      await redis.setex(`refresh:${user._id}`, 7 * 24 * 60 * 60, refreshToken);
      await trackSession(redis, user._id, req);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
    });
  }
};

// ─── LOGIN (with UEBA Analysis) ───
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ─── IP Blacklist/Whitelist Check ───
    const redis = getRedis();
    if (redis && req.clientIP) {
      const isBlacklisted = await redis.sismember('ip:blacklist', req.clientIP);
      if (isBlacklisted) {
        // Notify admin via socket
        const io = req.app.get('io');
        if (io) {
          io.to('admin-room').emit('security-alert', {
            type: 'critical',
            title: 'Blacklisted IP Login Attempt',
            message: `${email} from ${req.clientIP}`,
            email, ipAddress: req.clientIP,
            timestamp: new Date().toISOString(),
          });
        }
        await createAuditLog({
          userId: null,
          action: 'login_blocked',
          ipAddress: req.clientIP,
          userAgent: req.clientUserAgent,
          details: { email, reason: 'IP blacklisted' },
        }).catch(() => {});
        return res.status(403).json({
          success: false,
          message: 'Access denied. Your IP has been blocked.',
          code: 'IP_BLACKLISTED',
        });
      }
    }

    // ─── Account Lockout Check ───
    if (redis) {
      const lockKey = `loginLock:${email}`;
      const locked = await redis.get(lockKey);
      if (locked) {
        const ttl = await redis.ttl(lockKey);
        return res.status(423).json({
          success: false,
          message: `Account temporarily locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minute(s).`,
          code: 'ACCOUNT_LOCKED',
          retryAfter: ttl,
        });
      }
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      // Track failed attempt even for unknown emails (prevents enumeration timing attacks)
      if (redis) {
        await _trackFailedLogin(redis, email, req);
      }
      await createAuditLog({
        userId: null,
        action: 'login_failed',
        ipAddress: req.clientIP,
        userAgent: req.clientUserAgent,
        success: false,
        details: { email, reason: 'User not found' },
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Contact admin.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Track failed login attempt — lock after 5 failures
      if (redis) {
        const locked = await _trackFailedLogin(redis, email, req);
        if (locked) {
          sendAccountLockedAlert(user.email)
            .catch(err => console.error('Account locked email failed:', err.message));
        }
      }

      await createAuditLog({
        userId: user._id,
        action: 'login_failed',
        ipAddress: req.clientIP,
        userAgent: req.clientUserAgent,
        success: false,
        details: { reason: 'Incorrect password' },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // ─── Clear failed login counter on successful password match ───
    if (redis) {
      await redis.del(`loginFail:${email}`);
    }

    // ─── Check if this device is currently blocked ───
    const deviceScope = req.deviceFingerprint || 'default';
    if (redis && deviceScope !== 'default') {
      // Clear stale block/revocation on fresh login — user is re-authenticating with valid credentials
      await redis.del(`blocked:${user._id}:${deviceScope}`);
      await redis.del(`revoked:${user._id}:${deviceScope}`);
    }

    // UEBA Behavioral Analysis
    const deviceType = req.deviceInfo?.os || 'Unknown';
    const { simulation } = req.body; // Simulation overrides for dev testing
    const uebaResult = await analyzeUserBehavior({
      user,
      ipAddress: req.clientIP,
      deviceFingerprint: req.deviceFingerprint,
      userAgent: req.clientUserAgent,
      deviceType,
      simulation,
    });

    console.log(`\n── UEBA Analysis for ${email} ──`);
    console.log(`   IP: ${req.clientIP} | Fingerprint: ${req.deviceFingerprint || 'MISSING'} | Device: ${deviceType}`);
    console.log(`   Score: ${uebaResult.risk_score} | Level: ${uebaResult.risk_level} | Recommendation: ${uebaResult.recommendation}`);
    console.log(`   New IP: ${uebaResult.is_new_ip} | New Device: ${uebaResult.is_new_device} | New Country: ${uebaResult.is_new_country}`);
    console.log(`   Challenges: ${(uebaResult.required_challenges || []).join(', ') || 'none'}`);
    if (uebaResult._ueba_error) console.log(`   ⚠️ UEBA ERROR: ${uebaResult._ueba_error}`);
    console.log(`   Factors: ${uebaResult.factors?.filter(f => f.triggered).map(f => f.factor).join(', ') || 'none triggered'}`);

    // Cache risk score in Redis — scoped per device so other sessions are unaffected
    const uebaUnavailable = !!uebaResult._ueba_unavailable;
    if (redis) {
      await redis.setex(
        `risk:${user._id}:${deviceScope}`,
        60 * 30,
        JSON.stringify({
          score: uebaResult.risk_score,
          level: uebaResult.risk_level,
          factors: uebaResult.factors,
          recommendation: uebaResult.recommendation,
          required_challenges: uebaResult.required_challenges || [],
          challenge_reason: uebaResult.challenge_reason || '',
          geo_info: uebaResult.geo_info || null,
          ueba_unavailable: uebaUnavailable,
          timestamp: new Date().toISOString(),
        })
      );

      // NOTE: stepup:pending is NOT set here — it's set later only when step-up is
      // actually required (after whitelist/trust bypass checks). Setting it prematurely
      // would cause the access gateway to block whitelisted/trusted users.
    }

    // Build login context (used for baseline update and audit logging)
    const loginContext = {
      ipAddress: req.clientIP,
      deviceFingerprint: req.deviceFingerprint,
      userAgent: req.clientUserAgent,
      loginTime: new Date(),
      loginHour: new Date().getHours(),
    };

    // Store risk in user history (always, even for blocked logins)
    const riskEntry = {
      score: uebaResult.risk_score,
      level: uebaResult.risk_level,
      factors: uebaResult.factors
        .filter(f => f.triggered)
        .map(f => f.factor),
      action: uebaResult.recommendation === 'allow' ? 'allowed'
        : uebaResult.recommendation === 'step_up' ? 'step-up'
        : 'blocked',
    };
    await User.findByIdAndUpdate(user._id, {
      $push: { riskHistory: { $each: [riskEntry], $slice: -50 } },
    });

    // Real-time Socket.io events
    const io = req.app.get('io');
    if (io) {
      // When UEBA is down, emit a distinct service-health alert instead of a fake risk event
      if (uebaUnavailable) {
        io.to('admin-room').emit('login-event', {
          userId: user._id,
          email: user.email,
          name: user.name,
          riskScore: uebaResult.risk_score,
          riskLevel: uebaResult.risk_level,
          recommendation: uebaResult.recommendation,
          ipAddress: loginContext.ipAddress,
          geoInfo: null,
          factors: uebaResult.factors,
          deviceInfo: req.deviceInfo,
          uebaUnavailable: true,
          timestamp: new Date().toISOString(),
        });
        io.to('admin-room').emit('security-alert', {
          type: 'warning',
          title: 'UEBA Service Unreachable',
          message: `${user.email} — fail-closed step-up enforced (security question + OTP/TOTP)`,
          email: user.email,
          riskScore: uebaResult.risk_score,
          riskLevel: uebaResult.risk_level,
          factors: ['UEBA risk engine is down — unable to assess behavioral risk'],
          uebaUnavailable: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        io.to('admin-room').emit('login-event', {
          userId: user._id,
          email: user.email,
          name: user.name,
          riskScore: uebaResult.risk_score,
          riskLevel: uebaResult.risk_level,
          recommendation: uebaResult.recommendation,
          ipAddress: loginContext.ipAddress,
          geoInfo: uebaResult.geo_info,
          factors: uebaResult.factors,
          deviceInfo: req.deviceInfo,
          timestamp: new Date().toISOString(),
        });

        if (uebaResult.risk_level === 'high' || uebaResult.risk_level === 'medium') {
          io.to('admin-room').emit('security-alert', {
            type: uebaResult.risk_level === 'high' ? 'critical' : 'warning',
            title: uebaResult.risk_level === 'high' ? 'High-Risk Session Blocked' : 'Medium-Risk Step-Up Triggered',
            message: `${user.email} - Score: ${uebaResult.risk_score}`,
            email: user.email,
            riskScore: uebaResult.risk_score,
            riskLevel: uebaResult.risk_level,
            factors: uebaResult.factors.filter(f => f.triggered).map(f => f.description),
            geoInfo: uebaResult.geo_info,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // ─── HIGH RISK: Risk score > 60 — block THIS device session only ───
    const triggeredFactors = uebaResult.factors?.filter(f => f.triggered).map(f => f.description) || [];

    if (uebaResult.risk_score > 60) {
      // Block only this device session — do NOT set isBlocked on the user account
      // Account-level blocking should only be done manually by an admin
      if (redis) {
        await redis.del(`refresh:${user._id}`);
        await redis.setex(`blocked:${user._id}:${deviceScope}`, 60 * 60, 'true'); // 1 hour device block
        await redis.del(`risk:${user._id}:${deviceScope}`);
      }

      // Emit socket events BEFORE responding so admin dashboard gets notified
      if (io) {
        io.to('admin-room').emit('user-auto-blocked', {
          userId: user._id,
          email: user.email,
          name: user.name,
          riskScore: uebaResult.risk_score,
          factors: triggeredFactors,
          timestamp: new Date().toISOString(),
        });
        io.to('admin-room').emit('security-alert', {
          type: 'critical',
          title: 'High-Risk Login Blocked',
          message: `${user.email} — Risk Score: ${uebaResult.risk_score}`,
          email: user.email,
          riskScore: uebaResult.risk_score,
          factors: triggeredFactors,
          timestamp: new Date().toISOString(),
        });
      }

      await createAuditLog({
        userId: user._id,
        action: 'login_blocked',
        ipAddress: loginContext.ipAddress,
        riskScore: uebaResult.risk_score,
        riskLevel: 'high',
        details: {
          reason: 'Risk score > 60 at login — device session blocked',
          factors: uebaResult.factors,
          deviceInfo: { os: req.deviceInfo?.os, browser: req.deviceInfo?.browser, deviceType: req.deviceInfo?.deviceType },
        },
      });

      sendAutoBlockAlert(user.email, uebaResult.risk_score, triggeredFactors)
        .catch(err => console.error('Auto-block email failed:', err.message));

      return res.status(403).json({
        success: false,
        message: 'Login blocked due to high-risk activity. Contact admin if this was you.',
        code: 'LOGIN_BLOCKED',
        riskScore: uebaResult.risk_score,
      });
    }

    // Email Alerts (non-blocking)
    if (uebaUnavailable) {
      // Dedicated UEBA-down alert — don't pretend it's a regular medium-risk event
      sendUEBADownAlert(user.email)
        .catch(err => console.error('UEBA-down email failed:', err.message));
    } else if (uebaResult.risk_level === 'high') {
      sendHighRiskAlert(user.email, uebaResult.risk_score, triggeredFactors)
        .catch(err => console.error('High-risk email failed:', err.message));
    } else if (uebaResult.risk_level === 'medium') {
      sendMediumRiskAlert(user.email, uebaResult.risk_score, triggeredFactors)
        .catch(err => console.error('Medium-risk email failed:', err.message));
    }

    if (uebaResult.is_new_country && uebaResult.geo_info && !uebaResult.geo_info.is_private) {
      sendNewCountryAlert(user.email, uebaResult.geo_info.country, uebaResult.geo_info.city, uebaResult.risk_score)
        .catch(err => console.error('New country email failed:', err.message));
    }

    // ─── Check if IP is whitelisted (trusted IP skips step-up) ───
    let ipWhitelisted = false;
    if (redis && req.clientIP) {
      ipWhitelisted = await redis.sismember('ip:whitelist', req.clientIP);
    }

    // ─── Check if this device is trusted (user opted to "remember this device") ───
    let deviceTrusted = false;
    if (redis && deviceScope !== 'default') {
      const trusted = await redis.get(`trusted:${user._id}:${deviceScope}`);
      if (trusted) deviceTrusted = true;
    }

    // ─── STEP-UP REQUIRED: Issue pending token only (no full access) ───
    // Skip step-up for whitelisted IPs and trusted devices (but NOT for high-risk scores > 60)
    const stepUpRequired = !ipWhitelisted && !deviceTrusted && uebaResult.required_challenges && uebaResult.required_challenges.length > 0;

    console.log(`   IP Whitelisted: ${ipWhitelisted} | Device Trusted: ${deviceTrusted} | Step-Up Required: ${stepUpRequired}`);

    if (stepUpRequired) {
      // Set step-up pending in Redis NOW — only after confirming bypass checks didn't skip it
      if (redis) {
        await redis.setex(
          `stepup:pending:${user._id}:${deviceScope}`,
          60 * 30,
          JSON.stringify({
            required: uebaResult.required_challenges,
            reason: uebaResult.challenge_reason || '',
            completedMethods: [],
            uebaUnavailable,
          })
        );
      }

      // Issue a short-lived pending token — only valid for step-up routes
      const pendingToken = generatePendingToken(user);

      // Log as login_initiated (not login_success — user hasn't fully logged in yet)
      await createAuditLog({
        userId: user._id,
        action: 'login_initiated',
        ipAddress: loginContext.ipAddress,
        deviceFingerprint: loginContext.deviceFingerprint,
        userAgent: loginContext.userAgent,
        riskScore: uebaResult.risk_score,
        riskLevel: uebaResult.risk_level,
        details: {
          loginHour: loginContext.loginHour,
          isNewIP: uebaResult.is_new_ip,
          isNewDevice: uebaResult.is_new_device,
          isNewCountry: uebaResult.is_new_country,
          geoInfo: uebaResult.geo_info,
          factors: uebaResult.factors,
          challenges: uebaResult.required_challenges,
          reason: uebaResult.challenge_reason,
          deviceInfo: {
            os: req.deviceInfo?.os || 'Unknown',
            browser: req.deviceInfo?.browser || 'Unknown',
            deviceType: req.deviceInfo?.deviceType || 'Unknown',
          },
        },
      });

      // Emit socket event so admin dashboard updates in real-time
      if (io) {
        io.to('admin-room').emit('step-up-triggered', {
          userId: user._id,
          email: user.email,
          name: user.name,
          riskScore: uebaResult.risk_score,
          riskLevel: uebaResult.risk_level,
          challenges: uebaResult.required_challenges,
          reason: uebaResult.challenge_reason,
          ipAddress: loginContext.ipAddress,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Step-up verification required.',
        stepUpRequired: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            secretQuestion: user.secretQuestion,
          },
          pendingToken,
          riskAssessment: {
            score: uebaResult.risk_score,
            level: uebaResult.risk_level,
            recommendation: uebaResult.recommendation,
            factors: uebaResult.factors,
            geoInfo: uebaResult.geo_info,
          },
          requiredChallenges: uebaResult.required_challenges,
          challengeReason: uebaResult.challenge_reason || '',
          loginContext: {
            isNewIP: uebaResult.is_new_ip,
            isNewDevice: uebaResult.is_new_device,
            isNewCountry: uebaResult.is_new_country,
            ipAddress: loginContext.ipAddress,
            deviceInfo: req.deviceInfo,
          },
        },
      });
    }

    // ─── Update baseline profile (only for allowed/step-up logins, NOT blocked) ───
    // This must happen AFTER the block decision to prevent attacker IPs/devices
    // from being learned into the baseline on a blocked login attempt.
    const baselineUpdateOps = {
      $inc: { 'baselineProfile.loginCount': 1 },
      $set: {
        'baselineProfile.lastLoginAt': loginContext.loginTime,
        'baselineProfile.lastLoginIP': loginContext.ipAddress,
        'baselineProfile.lastLoginDevice': loginContext.deviceFingerprint,
      },
    };

    if (!user.baselineProfile.knownIPs.includes(loginContext.ipAddress)) {
      baselineUpdateOps.$addToSet = { ...baselineUpdateOps.$addToSet, 'baselineProfile.knownIPs': loginContext.ipAddress };
    }
    if (loginContext.deviceFingerprint && loginContext.deviceFingerprint !== 'unknown' && !user.baselineProfile.knownDevices.includes(loginContext.deviceFingerprint)) {
      baselineUpdateOps.$addToSet = { ...baselineUpdateOps.$addToSet, 'baselineProfile.knownDevices': loginContext.deviceFingerprint };
    }
    if (!(user.baselineProfile.knownDeviceTypes || []).includes(deviceType)) {
      baselineUpdateOps.$addToSet = { ...baselineUpdateOps.$addToSet, 'baselineProfile.knownDeviceTypes': deviceType };
    }
    if (uebaResult.geo_info && !uebaResult.geo_info.is_private) {
      baselineUpdateOps.$addToSet = {
        ...baselineUpdateOps.$addToSet,
        'baselineProfile.geoLocations': {
          city: uebaResult.geo_info.city,
          region: uebaResult.geo_info.region,
          country: uebaResult.geo_info.country,
          loc: uebaResult.geo_info.loc,
        },
      };
    }
    await User.findByIdAndUpdate(user._id, baselineUpdateOps);

    // ─── CLEAN LOGIN: No step-up needed — issue full tokens ───
    await createAuditLog({
      userId: user._id,
      action: 'login_success',
      ipAddress: loginContext.ipAddress,
      deviceFingerprint: loginContext.deviceFingerprint,
      userAgent: loginContext.userAgent,
      riskScore: uebaResult.risk_score,
      riskLevel: uebaResult.risk_level,
      details: {
        loginHour: loginContext.loginHour,
        isNewIP: uebaResult.is_new_ip,
        isNewDevice: uebaResult.is_new_device,
        isNewCountry: uebaResult.is_new_country,
        geoInfo: uebaResult.geo_info,
        factors: uebaResult.factors,
        deviceInfo: {
          os: req.deviceInfo?.os || 'Unknown',
          browser: req.deviceInfo?.browser || 'Unknown',
          deviceType: req.deviceInfo?.deviceType || 'Unknown',
        },
      },
    });

    const accessToken = generateAccessToken(user, req.deviceFingerprint);
    const refreshToken = generateRefreshToken(user);

    if (redis) {
      await redis.setex(`refresh:${user._id}`, 7 * 24 * 60 * 60, refreshToken);
      await trackSession(redis, user._id, req);
    }

    // Compute average risk score from updated riskHistory
    const updatedUser = await User.findById(user._id).select('riskHistory');
    const allRiskEntries = updatedUser?.riskHistory || [];
    const avgRiskScore = allRiskEntries.length > 0
      ? Math.round(allRiskEntries.reduce((sum, r) => sum + r.score, 0) / allRiskEntries.length)
      : 0;
    const avgRiskLevel = avgRiskScore > 60 ? 'high' : avgRiskScore > 30 ? 'medium' : 'low';

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          avgRiskScore,
          avgRiskLevel,
        },
        accessToken,
        refreshToken,
        riskAssessment: {
          score: uebaResult.risk_score,
          level: uebaResult.risk_level,
          recommendation: uebaResult.recommendation,
          factors: uebaResult.factors,
          geoInfo: uebaResult.geo_info,
        },
        loginContext: {
          isNewIP: uebaResult.is_new_ip,
          isNewDevice: uebaResult.is_new_device,
          isNewCountry: uebaResult.is_new_country,
          ipAddress: loginContext.ipAddress,
          deviceInfo: req.deviceInfo,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
    });
  }
};

// ─── REFRESH TOKEN ───
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Refresh token required.' });
    }

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id);

    if (!user || user.isBlocked) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const redis = getRedis();
    if (redis) {
      const storedToken = await redis.get(`refresh:${user._id}`);
      if (storedToken !== token) {
        return res.status(401).json({ success: false, message: 'Refresh token revoked.' });
      }

      // Check if this device's session has been revoked
      const deviceScope = req.deviceFingerprint || req.headers?.['x-device-fingerprint'] || 'default';
      if (deviceScope !== 'default') {
        const isRevoked = await redis.get(`revoked:${user._id}:${deviceScope}`);
        if (isRevoked) {
          return res.status(401).json({ success: false, message: 'Session has been revoked. Please log in again.', code: 'SESSION_REVOKED' });
        }
      }
    }

    const deviceScope = req.deviceFingerprint || req.headers?.['x-device-fingerprint'] || 'default';
    const newAccessToken = generateAccessToken(user, deviceScope);
    const newRefreshToken = generateRefreshToken(user);

    if (redis) {
      await redis.setex(`refresh:${user._id}`, 7 * 24 * 60 * 60, newRefreshToken);
    }

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid refresh token.' });
  }
};

// ─── LOGOUT ───
const logout = async (req, res) => {
  try {
    const redis = getRedis();
    if (redis && req.userId) {
      await redis.del(`refresh:${req.userId}`);
    }

    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

// ─── GET CURRENT USER ───
const getMe = async (req, res) => {
  const fullUser = await User.findById(req.user._id).select('totp.enabled riskHistory');

  // Compute average risk score from User.riskHistory (populated on every login)
  const riskEntries = fullUser?.riskHistory || [];
  const avgRiskScore = riskEntries.length > 0
    ? Math.round(riskEntries.reduce((sum, r) => sum + r.score, 0) / riskEntries.length)
    : 0;
  const avgRiskLevel = avgRiskScore > 60 ? 'high' : avgRiskScore > 30 ? 'medium' : 'low';

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        secretQuestion: req.user.secretQuestion,
        totpEnabled: fullUser?.totp?.enabled || false,
        baselineProfile: {
          loginCount: req.user.baselineProfile.loginCount,
          lastLoginAt: req.user.baselineProfile.lastLoginAt,
          knownIPCount: req.user.baselineProfile.knownIPs.length,
          knownDeviceCount: req.user.baselineProfile.knownDevices.length,
        },
        avgRiskScore,
        avgRiskLevel,
      },
    },
  });
};

// ─── UPDATE PROFILE ───
const updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const user = req.user;

    const updates = {};
    if (name && name.trim()) updates.name = name.trim();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    await User.findByIdAndUpdate(user._id, updates);

    res.status(200).json({
      success: true,
      message: 'Profile updated.',
      data: updates,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

// ─── CHANGE PASSWORD ───
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password +passwordHistory');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Check password history (reject reuse of last 5)
    const reused = await user.isPasswordReused(newPassword);
    if (reused) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reuse any of your last 5 passwords. Choose a different password.',
      });
    }

    // Also check current password
    const sameAsCurrent = await user.comparePassword(newPassword);
    if (sameAsCurrent) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
    }

    user.password = newPassword;
    await user.save();

    // A4: Invalidate all sessions on password change
    const redis = getRedis();
    if (redis) {
      await redis.del(`refresh:${user._id}`);
      // Clear all device sessions
      const sessionKeys = await redis.keys(`session:${user._id}:*`);
      const riskKeys = await redis.keys(`risk:${user._id}:*`);
      const stepupKeys = await redis.keys(`stepup:*:${user._id}:*`);
      for (const key of [...sessionKeys, ...riskKeys, ...stepupKeys]) {
        await redis.del(key);
      }
    }

    await createAuditLog({
      userId: user._id,
      action: 'password_change',
      ipAddress: req.clientIP,
      details: { sessionsInvalidated: true },
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. All other sessions have been logged out.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Password change failed.' });
  }
};

// ─── FORGOT PASSWORD ───
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset link has been sent.',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    const redis = getRedis();
    if (redis) {
      // Store hashed token in Redis (15 min expiry)
      await redis.setex(`reset:${resetHash}`, 900, user._id.toString());
    }

    // Send email
    await sendPasswordResetEmail(user.email, resetToken);

    res.status(200).json({
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
};

// ─── RESET PASSWORD ───
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const resetHash = crypto.createHash('sha256').update(token).digest('hex');

    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({ success: false, message: 'Service unavailable.' });
    }

    const userId = await redis.get(`reset:${resetHash}`);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    const user = await User.findById(userId).select('+password +passwordHistory');
    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found.' });
    }

    // Check password history
    const reused = await user.isPasswordReused(newPassword);
    if (reused) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reuse any of your last 5 passwords. Choose a different password.',
      });
    }

    const sameAsCurrent = await user.comparePassword(newPassword);
    if (sameAsCurrent) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
    }

    user.password = newPassword;
    await user.save();

    // Invalidate the token
    await redis.del(`reset:${resetHash}`);
    // A4: Invalidate ALL sessions on password reset
    await redis.del(`refresh:${userId}`);
    const sessionKeys = await redis.keys(`session:${userId}:*`);
    const riskKeys = await redis.keys(`risk:${userId}:*`);
    const stepupKeys = await redis.keys(`stepup:*:${userId}:*`);
    for (const key of [...sessionKeys, ...riskKeys, ...stepupKeys]) {
      await redis.del(key);
    }

    await createAuditLog({
      userId: user._id,
      action: 'password_reset_completed',
      ipAddress: req.clientIP,
    });

    res.status(200).json({ success: true, message: 'Password has been reset. Please login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Password reset failed.' });
  }
};

// ─── LOGIN HISTORY (for regular users) ───
const getLoginHistory = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      userId: req.user._id,
      action: { $in: ['login_success', 'login_failed'] },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('action ipAddress userAgent riskScore riskLevel success details createdAt');

    res.status(200).json({
      success: true,
      data: {
        history: logs.map(l => ({
          id: l._id,
          action: l.action,
          ipAddress: l.ipAddress,
          riskScore: l.riskScore,
          riskLevel: l.riskLevel,
          success: l.success,
          geoInfo: l.details?.geoInfo,
          isNewIP: l.details?.isNewIP,
          isNewDevice: l.details?.isNewDevice,
          isNewCountry: l.details?.isNewCountry,
          time: l.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Login history error:', error);
    res.status(500).json({ success: false, message: 'Failed to get login history.' });
  }
};

// ─── TRUSTED DEVICES ───
const getTrustedDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('baselineProfile.knownDevices baselineProfile.knownIPs');
    const redis = getRedis();

    // Get recent login logs to enrich device info
    const recentLogs = await AuditLog.find({
      userId: req.user._id,
      action: 'login_success',
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('deviceFingerprint ipAddress userAgent details createdAt');

    // Build device map with latest info
    const deviceMap = new Map();
    for (const log of recentLogs) {
      if (log.deviceFingerprint && !deviceMap.has(log.deviceFingerprint)) {
        // Check if this device is trusted (30-day remember)
        let isTrusted = false;
        if (redis) {
          const trusted = await redis.get(`trusted:${req.user._id}:${log.deviceFingerprint}`);
          isTrusted = !!trusted;
        }
        deviceMap.set(log.deviceFingerprint, {
          fingerprint: log.deviceFingerprint,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          deviceInfo: log.details?.deviceInfo,
          geoInfo: log.details?.geoInfo,
          lastSeen: log.createdAt,
          isTrusted,
          isCurrent: log.deviceFingerprint === (req.deviceFingerprint || 'default'),
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        devices: Array.from(deviceMap.values()),
        knownIPCount: user.baselineProfile?.knownIPs?.length || 0,
      },
    });
  } catch (error) {
    console.error('Trusted devices error:', error);
    res.status(500).json({ success: false, message: 'Failed to get devices.' });
  }
};

// ─── REVOKE DEVICE TRUST ───
const revokeDeviceTrust = async (req, res) => {
  try {
    const { fingerprint } = req.params;
    const redis = getRedis();

    if (redis && fingerprint) {
      await redis.del(`trusted:${req.user._id}:${fingerprint}`);
      // Also revoke the active session for this device so it can't keep using cached tokens
      await redis.setex(`revoked:${req.user._id}:${fingerprint}`, 24 * 60 * 60, 'true');
      await redis.del(`session:${req.user._id}:${fingerprint}`);
      await redis.del(`risk:${req.user._id}:${fingerprint}`);
      await redis.del(`stepup:verified:${req.user._id}:${fingerprint}`);
    }

    await createAuditLog({
      userId: req.user._id,
      action: 'device_trust_revoked',
      ipAddress: req.clientIP,
      details: { fingerprint },
    });

    res.status(200).json({ success: true, message: 'Device trust revoked.' });
  } catch (error) {
    console.error('Revoke trust error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke device trust.' });
  }
};

// ─── GET ACTIVE SESSIONS ───
const getActiveSessions = async (req, res) => {
  try {
    const redis = getRedis();
    const userId = req.user._id.toString();

    // Get all session keys for this user
    const sessions = [];
    if (redis) {
      const sessionKeys = await redis.keys(`session:${userId}:*`);
      for (const key of sessionKeys) {
        const raw = await redis.get(key);
        if (raw) {
          try {
            const session = JSON.parse(raw);
            const fp = key.split(':').slice(2).join(':');
            const isCurrent = fp === (req.deviceFingerprint || 'default');
            sessions.push({ ...session, fingerprint: fp, isCurrent });
          } catch {}
        }
      }
    }

    // Sort: current session first, then by lastActive descending
    sessions.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    res.status(200).json({ success: true, data: { sessions } });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get sessions.' });
  }
};

// ─── REVOKE SESSION (remote logout) ───
const revokeSession = async (req, res) => {
  try {
    const { fingerprint } = req.params;
    const redis = getRedis();
    const userId = req.user._id.toString();

    if (redis && fingerprint) {
      // Mark device as revoked — checked by protect middleware & refresh endpoint
      // TTL matches access token max lifetime (15 min) to ensure immediate rejection
      await redis.setex(`revoked:${userId}:${fingerprint}`, 24 * 60 * 60, 'true');
      // Remove session record
      await redis.del(`session:${userId}:${fingerprint}`);
      // Clear all device-scoped keys for that session
      await redis.del(`risk:${userId}:${fingerprint}`);
      await redis.del(`stepup:pending:${userId}:${fingerprint}`);
      await redis.del(`stepup:verified:${userId}:${fingerprint}`);
      await redis.del(`blocked:${userId}:${fingerprint}`);
      await redis.del(`trusted:${userId}:${fingerprint}`);
    }

    await createAuditLog({
      userId: req.user._id,
      action: 'session_revoked',
      ipAddress: req.clientIP,
      details: { revokedDevice: fingerprint },
    });

    // Notify admin
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('session-revoked', {
        userId,
        email: req.user.email,
        revokedDevice: fingerprint,
        timestamp: new Date().toISOString(),
      });
    }

    // Email alert (non-blocking)
    sendSessionRevokedAlert(req.user.email, req.deviceInfo)
      .catch(err => console.error('Session revoked email failed:', err.message));

    res.status(200).json({ success: true, message: 'Session revoked.' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke session.' });
  }
};

// ─── MY RISK SCORES (user's own risk history for trend graph) ───
const getMyRiskScores = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('riskHistory');
    const history = (user?.riskHistory || []).slice(-50);
    const dataPoints = history.map((entry, i) => ({
      session: i + 1,
      score: entry.score ?? 0,
      level: entry.level || 'low',
      timestamp: entry.timestamp,
      action: entry.action || '',
      factors: entry.factors || [],
    }));
    res.status(200).json({ success: true, data: { dataPoints } });
  } catch (error) {
    console.error('My risk scores error:', error);
    res.status(500).json({ success: false, message: 'Failed to get risk scores.' });
  }
};

// ─── ACTIVITY TIMELINE (security events) ───
const getActivityTimeline = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      userId: req.user._id,
      action: {
        $in: [
          'login_success', 'login_failed', 'login_blocked', 'login_initiated',
          'step_up_success', 'step_up_failed', 'step_up_triggered',
          'file_upload', 'file_download', 'file_delete',
          'password_change', 'password_reset_completed',
          'device_trust_revoked', 'session_revoked',
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('action ipAddress riskScore riskLevel details createdAt');

    const timeline = logs.map(l => ({
      id: l._id,
      action: l.action,
      ipAddress: l.ipAddress,
      riskScore: l.riskScore,
      riskLevel: l.riskLevel,
      deviceInfo: l.details?.deviceInfo,
      geoInfo: l.details?.geoInfo,
      time: l.createdAt,
    }));

    res.status(200).json({ success: true, data: { timeline } });
  } catch (error) {
    console.error('Activity timeline error:', error);
    res.status(500).json({ success: false, message: 'Failed to get activity timeline.' });
  }
};

module.exports = {
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
};
