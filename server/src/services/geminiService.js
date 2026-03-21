const Groq = require('groq-sdk');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// ─── Circuit Breaker ───
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  state: 'closed',
  THRESHOLD: 3,
  RESET_TIMEOUT: 60000,
};

const _checkCircuit = () => {
  if (circuitBreaker.state === 'open') {
    if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.RESET_TIMEOUT) {
      circuitBreaker.state = 'half-open';
      return 'half-open';
    }
    return 'open';
  }
  return circuitBreaker.state;
};

const _onSuccess = () => { circuitBreaker.failures = 0; circuitBreaker.state = 'closed'; };

const _onFailure = () => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.THRESHOLD) {
    circuitBreaker.state = 'open';
    console.warn(`⚠️ Chat Circuit Breaker OPEN — ${circuitBreaker.failures} consecutive failures`);
  }
};

// ─── System Prompt ───
const SYSTEM_PROMPT = `You are Zero, the AI assistant built into ZTCS (Zero Trust Cloud System). You help users navigate and understand the app. Only answer ZTCS-related questions. For anything else, say: "I can only help with ZTCS — try asking about files, security, or your account!"

# How to respond
- Be concise: 1-3 sentences. No filler, no greetings unless the user greets first.
- Be direct: lead with the answer, then explain briefly if needed.
- Use simple language, not jargon. If you mention a technical term, explain it in parentheses.
- Never repeat the user's name in every reply — only use it occasionally.
- If a user seems frustrated, acknowledge it briefly before helping.
- Use line breaks to separate distinct points. Never use bullet lists longer than 4 items.

# ZTCS Knowledge
- File Management: upload, download, delete files — all encrypted with AES-256 at rest via Supabase storage.
- Zero Trust: every single request is verified. No device or network is trusted by default.
- UEBA Risk Scoring: R = 20*V1 + 25*V2 + 10*V2b + 15*V3 + 30*V4 (capped at 100).
  V1=New IP, V2=New Device, V2b=New Device Type/OS, V3=Unusual Login Time, V4=Abnormal Usage (new country, impossible travel, rapid logins).
- Risk Levels: Low (0-30) = allowed, Medium (31-60) = step-up auth needed, High (>60) = session blocked.
- Step-Up Auth: Email OTP, TOTP authenticator app, or security question — user picks one.
- Sessions are per-device: blocking one device doesn't log you out of another.
- Admin Dashboard: manage users, view audit logs, monitor live sessions, see risk trends, control IP/geo rules.
- Security Settings: enable TOTP, change security question, manage trusted devices, change password.
- Notifications: real-time alerts for security events (new device login, session blocked, etc.).
- Activity Reports: downloadable PDF summaries of login and file activity.

# Common questions
- "Why am I blocked?" → High risk score (>60). Could be new device, new location, VPN, or unusual login time. Contact admin or try from a trusted device.
- "What is step-up auth?" → Extra verification when risk is medium (31-60). You'll be asked for OTP, TOTP, or security question.
- "How do I upload files?" → Go to Files page, click Upload, select files. They're encrypted automatically.
- "How do I set up TOTP?" → Go to Security Settings, click "Set up Authenticator", scan the QR code with an app like Google Authenticator.`;

/**
 * Send a message to Groq and get a response.
 * @param {Object} params
 * @param {string} params.message - User's message
 * @param {Array} params.conversationHistory - Previous messages [{role, content}]
 * @param {string} params.userName - User's display name
 */
const chat = async ({ message, conversationHistory = [], userName }) => {
  if (!GROQ_API_KEY) {
    return 'Zero is not configured yet. Please ask an admin to set up the GROQ_API_KEY.';
  }

  const cbState = _checkCircuit();
  if (cbState === 'open') {
    return "I'm temporarily unavailable. Please try again in a minute.";
  }

  try {
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nThe user's name is ${userName}.` },
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

    _onSuccess();
    return reply;
  } catch (error) {
    console.error('Chat service error:', error.message);
    _onFailure();
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
};

module.exports = { chat };
