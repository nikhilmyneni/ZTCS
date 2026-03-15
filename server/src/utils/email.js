const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'tijohnwicky@gmail.com';
const FROM_NAME = 'ZTCS Security';

// ─── IST Time Helper ───
const getIST = () => {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' IST';
};

// ─── Design System ───
const C = {
  bg: '#0a0a0f',
  card: '#12121c',
  cardInner: '#16162a',
  border: '#1e1e36',
  borderLight: '#2a2a48',
  violet: '#8b5cf6',
  violetSoft: 'rgba(139,92,246,0.08)',
  violetBorder: 'rgba(139,92,246,0.18)',
  text: '#e2e2f0',
  textBright: '#ffffff',
  muted: '#6b6b88',
  red: '#ef4444',
  redSoft: 'rgba(239,68,68,0.06)',
  redBorder: 'rgba(239,68,68,0.15)',
  amber: '#f59e0b',
  amberSoft: 'rgba(245,158,11,0.06)',
  amberBorder: 'rgba(245,158,11,0.15)',
  green: '#22c55e',
  greenSoft: 'rgba(34,197,94,0.06)',
  greenBorder: 'rgba(34,197,94,0.15)',
  cyan: '#06b6d4',
};

// ─── Email Shell ───
const emailWrapper = (content, title, accent = C.violet) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="padding:20px 24px;background:${C.card};border:1px solid ${C.border};border-radius:12px 12px 0 0;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:36px;height:36px;background:${C.violetSoft};border:1px solid ${C.violetBorder};border-radius:10px;text-align:center;vertical-align:middle;">
              <span style="color:${C.violet};font-size:16px;font-weight:800;line-height:36px;">Z</span>
            </td>
            <td style="padding-left:12px;">
              <span style="color:${C.textBright};font-size:13px;font-weight:700;letter-spacing:0.08em;">ZTCS</span>
              <span style="color:${C.muted};font-size:13px;font-weight:400;letter-spacing:0.08em;"> SECURITY</span>
            </td>
          </tr></table>
        </td>
      </tr>
    </table>

    <!-- Body -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:28px 24px;">
          ${title ? `
          <h1 style="color:${C.textBright};font-size:17px;font-weight:700;margin:0 0 20px;letter-spacing:-0.02em;">${title}</h1>
          ` : ''}
          ${content}
        </td>
      </tr>
    </table>

    <!-- Footer -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
      <tr>
        <td style="text-align:center;padding:12px;">
          <p style="color:${C.muted};font-size:11px;margin:0;line-height:1.5;">
            Zero Trust Cloud System &middot; Automated Security Alert<br>
            This is an automated message. Do not reply to this email.
          </p>
        </td>
      </tr>
    </table>

  </div>
</body>
</html>`;

// ─── Reusable: Info Row ───
const infoRow = (label, value, valueColor = C.text, valueBold = false) => `
  <tr>
    <td style="padding:10px 12px;color:${C.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.06em;width:110px;vertical-align:top;">${label}</td>
    <td style="padding:10px 12px;color:${valueColor};font-size:13px;${valueBold ? 'font-weight:700;' : ''}">${value}</td>
  </tr>`;

// ─── Reusable: Info Table ───
const infoTable = (rows) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.cardInner};border:1px solid ${C.border};border-radius:8px;margin:0 0 20px;">
    ${rows}
  </table>`;

// ─── Reusable: Alert Banner ───
const alertBanner = (text, color, bgColor, borderColor) => `
  <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:14px 16px;margin:0 0 20px;">
    <p style="color:${color};font-size:13px;font-weight:600;margin:0;">${text}</p>
  </div>`;

// ─── Reusable: Factor List ───
const factorList = (factors) => {
  if (!factors || factors.length === 0) return '';
  const items = factors.map(f =>
    `<li style="padding:4px 0;color:${C.text};font-size:12px;line-height:1.5;">${f}</li>`
  ).join('');
  return `
    <p style="color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Triggered Factors</p>
    <ul style="margin:0 0 20px;padding:0 0 0 16px;">${items}</ul>`;
};

const sendMail = async (to, subject, html) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Brevo API error: ${res.status}`);
  }
  return res.json();
};

// ─── OTP Email ───
const sendOTP = async (to, otp) => {
  const html = emailWrapper(`
    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;">
      A verification code was requested for your account. Enter the code below to confirm your identity.
    </p>
    <div style="background:${C.cardInner};border:1px solid ${C.borderLight};border-radius:10px;padding:28px;text-align:center;margin:0 0 24px;">
      <span style="font-size:32px;font-weight:700;letter-spacing:12px;color:${C.textBright};font-family:'Courier New',Consolas,monospace;">${otp}</span>
    </div>
    ${infoTable(
      infoRow('Expires', '5 minutes from now') +
      infoRow('Time', getIST())
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">If you did not request this code, change your password immediately and review your recent activity.</p>
  `, 'Verification Code');

  return sendMail(to, 'Your Verification Code \u2014 ZTCS', html);
};

// ─── High-Risk Alert ───
const sendHighRiskAlert = async (userEmail, riskScore, factors) => {
  const html = emailWrapper(`
    ${alertBanner('High-Risk Session Detected &amp; Blocked', C.red, C.redSoft, C.redBorder)}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Risk Score', `<span style="font-size:20px;font-weight:800;font-family:'Courier New',monospace;color:${C.red};">${riskScore}</span>`) +
      infoRow('Time', getIST()) +
      infoRow('Action', 'Session blocked on device', C.red, true)
    )}
    ${factorList(factors)}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">Review this event in the admin dashboard. The device session has been blocked for 1 hour.</p>
  `, 'Security Alert');

  return sendMail(process.env.ALERT_EMAIL, `HIGH RISK \u2014 ${userEmail} \u2014 Score: ${riskScore}`, html);
};

// ─── Medium-Risk Alert ───
const sendMediumRiskAlert = async (userEmail, riskScore, factors) => {
  const html = emailWrapper(`
    ${alertBanner('Step-Up Authentication Triggered', C.amber, C.amberSoft, C.amberBorder)}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Risk Score', `<span style="font-size:18px;font-weight:800;font-family:'Courier New',monospace;color:${C.amber};">${riskScore}</span>`) +
      infoRow('Time', getIST()) +
      infoRow('Factors', factors.join(', '))
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">The user has been prompted for additional verification before access is granted.</p>
  `, 'Step-Up Triggered');

  return sendMail(process.env.ALERT_EMAIL, `MEDIUM RISK \u2014 ${userEmail} \u2014 Score: ${riskScore}`, html);
};

// ─── Bulk Download Alert ───
const sendBulkDownloadAlert = async (userEmail, downloadCount) => {
  const html = emailWrapper(`
    ${alertBanner('Bulk Download Activity Detected', C.amber, C.amberSoft, C.amberBorder)}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Downloads', `${downloadCount} files in 5 minutes`, C.amber, true) +
      infoRow('Time', getIST()) +
      infoRow('Action', 'Step-up verification triggered')
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">This may indicate data exfiltration. Review the user's recent file activity in the admin dashboard.</p>
  `, 'Download Alert');

  return sendMail(process.env.ALERT_EMAIL, `BULK DOWNLOAD \u2014 ${userEmail} \u2014 ${downloadCount} files`, html);
};

// ─── New Country Login Alert ───
const sendNewCountryAlert = async (userEmail, country, city, riskScore) => {
  const html = emailWrapper(`
    ${alertBanner('Login From New Country Detected', C.violet, C.violetSoft, C.violetBorder)}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Location', `${city}, ${country}`, C.violet, true) +
      infoRow('Risk Score', riskScore) +
      infoRow('Time', getIST())
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">This login originated from a country not previously seen for this account. Verify this was an authorized access.</p>
  `, 'Geo Alert');

  return sendMail(process.env.ALERT_EMAIL, `NEW COUNTRY \u2014 ${userEmail} \u2014 ${city}, ${country}`, html);
};

// ─── UEBA Service Down Alert ───
const sendUEBADownAlert = async (userEmail) => {
  const html = emailWrapper(`
    ${alertBanner('UEBA Risk Engine Unreachable', C.amber, C.amberSoft, C.amberBorder)}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Time', getIST()) +
      infoRow('Service', 'UEBA Behavior Analyzer', C.amber, true) +
      infoRow('Fallback', 'Full step-up enforced (security question + OTP/TOTP)')
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">
      The UEBA microservice was unreachable during this login attempt. The system enforced fail-closed policy with maximum step-up verification.
      Check if the UEBA service is running and investigate any deployment issues.
    </p>
  `, 'Service Health Alert');

  return sendMail(process.env.ALERT_EMAIL, `UEBA DOWN \u2014 fail-closed step-up for ${userEmail}`, html);
};

// ─── Password Reset Email ───
const sendPasswordResetEmail = async (to, resetToken) => {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];
  const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

  const html = emailWrapper(`
    <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 24px;">
      We received a request to reset your password. Click the button below to set a new password.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${resetUrl}" style="display:inline-block;background:${C.violet};color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:14px;">Reset Password</a>
    </div>
    ${infoTable(
      infoRow('Expires', '15 minutes from now') +
      infoRow('Time', getIST())
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">If you did not request this, you can safely ignore this email. Your password will remain unchanged.</p>
  `, 'Password Reset');

  return sendMail(to, 'Password Reset \u2014 ZTCS', html);
};

// ─── Auto-Block Alert ───
const sendAutoBlockAlert = async (userEmail, riskScore, factors) => {
  const html = emailWrapper(`
    ${alertBanner('High-Risk Login Blocked \u2014 Score &gt; 60', C.red, C.redSoft, C.redBorder)}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Risk Score', `<span style="font-size:22px;font-weight:800;font-family:'Courier New',monospace;color:${C.red};">${riskScore}</span>`) +
      infoRow('Time', getIST()) +
      infoRow('Action', 'Device session blocked for 1 hour', C.red, true)
    )}
    ${factorList(factors)}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">Use the Action Center in the admin dashboard to review this event. The user's other device sessions remain active.</p>
  `, 'Critical Security Alert');

  return sendMail(process.env.ALERT_EMAIL, `LOGIN BLOCKED \u2014 ${userEmail} \u2014 Risk Score: ${riskScore}`, html);
};

// ─── Session Revoked Alert ───
const sendSessionRevokedAlert = async (userEmail, deviceInfo) => {
  const html = emailWrapper(`
    ${alertBanner('Remote Session Revoked', C.cyan, 'rgba(6,182,212,0.06)', 'rgba(6,182,212,0.15)')}
    ${infoTable(
      infoRow('User', userEmail, C.textBright, true) +
      infoRow('Device', `${deviceInfo?.browser || 'Unknown'} on ${deviceInfo?.os || 'Unknown'}`) +
      infoRow('Time', getIST()) +
      infoRow('Action', 'Session terminated by user', C.cyan, true)
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">The user has remotely revoked a session from their device management panel.</p>
  `, 'Session Alert');

  return sendMail(process.env.ALERT_EMAIL, `SESSION REVOKED \u2014 ${userEmail}`, html);
};

// ─── Account Locked Alert ───
const sendAccountLockedAlert = async (userEmail) => {
  const html = emailWrapper(`
    ${alertBanner('Account Temporarily Locked', C.amber, C.amberSoft, C.amberBorder)}
    ${infoTable(
      infoRow('Account', userEmail, C.textBright, true) +
      infoRow('Reason', '5 consecutive failed login attempts', C.amber, true) +
      infoRow('Lock Duration', '15 minutes') +
      infoRow('Time', getIST())
    )}
    <p style="color:${C.muted};font-size:12px;line-height:1.5;margin:0;">
      If this was you, wait 15 minutes and try again. If you did not attempt to log in, consider changing your password immediately.
    </p>
  `, 'Account Locked');

  return sendMail(userEmail, 'Account Locked \u2014 Too Many Failed Attempts \u2014 ZTCS', html);
};

module.exports = {
  sendOTP,
  sendHighRiskAlert,
  sendMediumRiskAlert,
  sendBulkDownloadAlert,
  sendNewCountryAlert,
  sendPasswordResetEmail,
  sendAutoBlockAlert,
  sendSessionRevokedAlert,
  sendUEBADownAlert,
  sendAccountLockedAlert,
};
