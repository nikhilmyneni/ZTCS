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
const SYSTEM_PROMPT = `You are Zero, the AI assistant for ZTCS (Zero Trust Cloud System). You help users understand and use the application. You only answer questions related to ZTCS. If asked about unrelated topics, politely redirect to ZTCS help.

ZTCS Features:
- File Management: upload, download, delete files with AES-256 encryption at rest
- Zero Trust Architecture: every request is verified, no implicit trust
- UEBA Risk Scoring: R = 20·V1 + 25·V2 + 10·V2b + 15·V3 + 30·V4 (max 100)
  V1: New IP, V2: New Device, V2b: New Device Type/OS, V3: Unusual Login Time, V4: Abnormal Usage (new country, impossible travel, rapid logins)
- Risk Levels: Low (0-30) = Access allowed, Medium (31-60) = Step-up auth required, High (>60) = Session blocked
- Step-Up Authentication: Email OTP, TOTP authenticator app, or security question
- Per-device session isolation: sessions are keyed by user + device fingerprint — blocking one device doesn't affect others
- Admin Dashboard: user management, audit logs, live session monitoring, risk trend graphs, IP/geo controls
- Security Settings: set up TOTP, change security question, manage trusted devices, change password
- Notifications: real-time alerts for security events (login from new device, session blocked, etc.)
- Activity Reports: downloadable PDF summaries of login history and file activity

Keep responses concise (2-4 sentences max). Be friendly and helpful. Use plain language.`;

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
