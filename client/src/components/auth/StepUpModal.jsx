import { useState, useEffect } from 'react';
import { Shield, Mail, Key, Smartphone, Loader2, X, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

// Map abstract requirements to human-readable labels
const CHALLENGE_LABELS = {
  secret_question: 'Security Question',
  otp_or_totp: 'OTP / Authenticator',
};

// Map challenge reasons to user-friendly messages
const REASON_MESSAGES = {
  'Login from new IP and unrecognized device': 'New location and device — please verify.',
  'Login from new device type on known IP': 'New device type on your account.',
  'Login from new device on known IP': 'New device on your account.',
  'Login from new IP address (same country)': 'New IP address — quick verification needed.',
  'Login at unusual time': 'Login outside your usual hours.',
  'Bulk download detected': 'Large number of downloads flagged.',
  'Elevated risk detected': 'Unusual account activity flagged.',
  'Risk engine unavailable — identity verification required': 'Verification needed to continue.',
  'Risk engine unavailable — full verification required': 'Verification needed to continue.',
};

const StepUpModal = ({ isOpen, onClose, onVerified, secretQuestion, requiredChallenges = [], challengeReason = '' }) => {
  const [activeMethod, setActiveMethod] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [remainingSteps, setRemainingSteps] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(secretQuestion);
  const [trustDevice, setTrustDevice] = useState(false);

  // Determine what challenges are needed
  useEffect(() => {
    if (isOpen) {
      api.get('/stepup/status').then(({ data }) => {
        const s = data.data;
        if (s.totpEnabled) setTotpEnabled(true);
        if (s.secretQuestion) setCurrentQuestion(s.secretQuestion);

        // Use server-provided challenge data, falling back to props
        const required = s.requiredChallenges?.length > 0 ? s.requiredChallenges : requiredChallenges;
        const completed = s.completedMethods || [];
        const remaining = required.filter(r => !completed.includes(r));

        setCompletedSteps(completed);
        setRemainingSteps(remaining);

        // Auto-select first remaining challenge method
        if (remaining.length > 0) {
          setActiveMethod(remaining[0] === 'secret_question' ? 'secret' : (s.totpEnabled ? 'totp' : 'otp'));
        } else if (required.length === 0) {
          // No specific requirements — show all methods (legacy behavior)
          setActiveMethod(s.totpEnabled ? 'totp' : 'otp');
        }
      }).catch(() => {
        setActiveMethod('otp');
      });
    } else {
      // Reset state when modal closes
      setOtpSent(false);
      setCode('');
      setAnswer('');
      setCompletedSteps([]);
      setRemainingSteps([]);
      setTrustDevice(false);
    }
  }, [isOpen, requiredChallenges]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleVerificationResponse = (data, method) => {
    if (data.data.allComplete === false) {
      // Partial completion — move to next step
      const remaining = data.data.remaining || [];
      setRemainingSteps(remaining);
      setCompletedSteps(prev => [...prev, method === 'secret' ? 'secret_question' : 'otp_or_totp']);
      setCode('');
      setAnswer('');
      setOtpSent(false);

      // Auto-switch to next required method
      if (remaining.length > 0) {
        const next = remaining[0];
        if (next === 'secret_question') {
          setActiveMethod('secret');
        } else if (next === 'otp_or_totp') {
          setActiveMethod(totpEnabled ? 'totp' : 'otp');
        }
      }
      toast.success(`${method === 'secret' ? 'Security question' : 'Code'} verified. One more step.`);
    } else {
      // All challenges passed — store real tokens if provided
      if (data.data.accessToken) {
        localStorage.setItem('accessToken', data.data.accessToken);
      }
      if (data.data.refreshToken) {
        localStorage.setItem('refreshToken', data.data.refreshToken);
      }
      toast.success('Identity verified!');
      onVerified();
    }
  };

  const sendOTP = async () => {
    setLoading(true);
    try { await api.post('/stepup/otp/send'); setOtpSent(true); setCountdown(60); toast.success('Code sent.'); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed.'); }
    finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/stepup/otp/verify', { otp: code, trustDevice });
      handleVerificationResponse(data, 'otp');
    }
    catch (e) { toast.error(e.response?.data?.message || 'Invalid code.'); }
    finally { setLoading(false); }
  };

  const verifySecret = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/stepup/secret/verify', { answer, trustDevice });
      handleVerificationResponse(data, 'secret');
    }
    catch (e) { toast.error(e.response?.data?.message || 'Wrong answer.'); }
    finally { setLoading(false); }
  };

  const verifyTOTP = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/stepup/totp/verify', { code, trustDevice });
      handleVerificationResponse(data, 'totp');
    }
    catch (e) { toast.error(e.response?.data?.message || 'Invalid code.'); }
    finally { setLoading(false); }
  };

  if (!isOpen) return null;

  // Build available method tabs based on required challenges
  const hasRequirements = requiredChallenges.length > 0 || remainingSteps.length > 0;
  const allRequired = requiredChallenges.length > 0 ? requiredChallenges : remainingSteps;

  let methods = [];
  if (hasRequirements) {
    // Show only methods relevant to remaining requirements
    const needsSecretQ = allRequired.includes('secret_question');
    const needsOtpTotp = allRequired.includes('otp_or_totp');

    if (needsSecretQ && !completedSteps.includes('secret_question')) {
      methods.push({ id: 'secret', label: 'Secret Q', icon: Key });
    }
    if (needsOtpTotp && !completedSteps.includes('otp_or_totp')) {
      if (totpEnabled) methods.push({ id: 'totp', label: 'Authenticator', icon: Smartphone });
      methods.push({ id: 'otp', label: 'Email OTP', icon: Mail });
    }
  }

  // Fallback: show all methods if no specific requirements
  if (methods.length === 0 && !hasRequirements) {
    if (totpEnabled) methods.push({ id: 'totp', label: 'Authenticator', icon: Smartphone });
    methods.push({ id: 'otp', label: 'Email OTP', icon: Mail });
    methods.push({ id: 'secret', label: 'Secret Q', icon: Key });
  }

  // If somehow no methods (all completed), show nothing
  if (methods.length === 0) methods.push({ id: 'otp', label: 'Email OTP', icon: Mail });

  const totalSteps = requiredChallenges.length || 1;
  const currentStep = completedSteps.length + 1;
  const reasonMessage = REASON_MESSAGES[challengeReason] || challengeReason;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 glass-overlay">
      <div className="w-full max-w-md animate-scale" style={{
        background: 'rgba(255,255,255,0.035)', backdropFilter: 'blur(32px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px',
        padding: '1.75rem', boxShadow: '0 16px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <Shield className="w-5 h-5" style={{ color: 'var(--amber)' }} />
            </div>
            <div>
              <h3 className="text-sm font-bold">Verify Your Identity</h3>
              {totalSteps > 1 ? (
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Step {currentStep} of {totalSteps}</p>
              ) : (
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Additional verification required</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close verification dialog"><X className="w-4 h-4" /></button>
        </div>

        {/* Context Reason Banner */}
        {reasonMessage && (
          <div className="flex items-start gap-2.5 mb-5 px-3 py-2.5 rounded-lg" style={{
            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
          }}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--amber)' }} />
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text2)' }}>{reasonMessage}</p>
          </div>
        )}

        {/* Multi-step progress dots */}
        {totalSteps > 1 && (
          <div className="flex items-center justify-center gap-2 mb-5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full transition-all" style={{
                background: i < completedSteps.length ? 'var(--green)' : i === completedSteps.length ? 'var(--cyan)' : 'var(--bg3)',
                boxShadow: i === completedSteps.length ? '0 0 8px rgba(6,182,212,0.4)' : 'none',
              }} />
            ))}
          </div>
        )}

        {/* Method Tabs */}
        {methods.length > 1 && (
          <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg3)' }}>
            {methods.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setActiveMethod(id); setCode(''); setAnswer(''); }}
                className="flex-1 py-2.5 text-[11px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all"
                style={activeMethod === id ? {
                  background: 'rgba(255,255,255,0.06)', color: 'var(--cyan)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                } : { color: 'var(--muted)' }}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
        )}

        {/* TOTP */}
        {activeMethod === 'totp' && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: 'var(--text2)' }}>Enter the 6-digit code from your authenticator app.</p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="text-center text-xl tracking-[0.4em]" style={{ fontFamily: 'var(--mono)' }} maxLength={6} autoFocus />
            <button onClick={verifyTOTP} disabled={code.length !== 6 || loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Verify
            </button>
          </div>
        )}

        {/* Email OTP */}
        {activeMethod === 'otp' && (
          <div className="space-y-4">
            {!otpSent ? (
              <>
                <p className="text-xs" style={{ color: 'var(--text2)' }}>We'll send a verification code to your email.</p>
                <button onClick={sendOTP} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send Code
                </button>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: 'var(--text2)' }}>Enter the 6-digit code sent to your email.</p>
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="text-center text-xl tracking-[0.4em]" style={{ fontFamily: 'var(--mono)' }} maxLength={6} autoFocus />
                <button onClick={verifyOTP} disabled={code.length !== 6 || loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Verify
                </button>
                <button onClick={sendOTP} disabled={countdown > 0} className="text-[11px] w-full text-center transition-colors" style={{ color: 'var(--muted)' }}>
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Secret Question */}
        {activeMethod === 'secret' && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: 'var(--text2)' }}>Answer your security question:</p>
            <div className="text-xs font-medium" style={{
              padding: '0.75rem 1rem', background: 'var(--bg3)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            }}>
              {currentQuestion || secretQuestion || 'Loading...'}
            </div>
            <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Your answer" autoFocus />
            <button onClick={verifySecret} disabled={!answer.trim() || loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Verify
            </button>
          </div>
        )}

        {/* Trust this device toggle */}
        <div className="flex items-center gap-3 mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            role="switch"
            aria-checked={trustDevice}
            onClick={() => setTrustDevice(!trustDevice)}
            className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
            style={{
              background: trustDevice ? 'var(--cyan)' : 'rgba(255,255,255,0.1)',
              border: '1px solid',
              borderColor: trustDevice ? 'var(--cyan)' : 'rgba(255,255,255,0.15)',
            }}
          >
            <span
              className="pointer-events-none inline-block h-4 w-4 rounded-full shadow transform transition-transform duration-200 ease-in-out"
              style={{
                background: '#fff',
                transform: trustDevice ? 'translateX(16px)' : 'translateX(0)',
                marginTop: '1px',
                marginLeft: '1px',
              }}
            />
          </button>
          <span className="text-[11px] select-none cursor-pointer" style={{ color: 'var(--text2)' }} onClick={() => setTrustDevice(!trustDevice)}>
            Remember this device for 30 days
          </span>
        </div>
      </div>
    </div>
  );
};

export default StepUpModal;
