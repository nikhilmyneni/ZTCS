import { useState, useEffect } from 'react';
import { Smartphone, Loader2, CheckCircle, Copy, Check, ShieldCheck, RotateCcw } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const TOTPSetup = ({ onComplete }) => {
  const [step, setStep] = useState('loading');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [showReset, setShowReset] = useState(false);

  // Check if TOTP is already enabled on mount
  useEffect(() => {
    api.get('/stepup/status').then(({ data }) => {
      if (data.data.totpEnabled) {
        setStep('done');
      } else {
        setStep('init');
      }
    }).catch(() => setStep('init'));
  }, []);

  const setup = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/stepup/totp/setup');
      setQr(data.data.qrCode);
      setSecret(data.data.secret);
      setStep('scan');
    } catch {
      toast.error('Setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    try {
      await api.post('/stepup/totp/verify', { code });
      setStep('done');
      toast.success('Authenticator enabled!');
      if (onComplete) onComplete();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="flex justify-center py-8" style={{
        background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '1.25rem',
      }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} />
      </div>
    );
  }

  if (step === 'init') {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '1.25rem',
      }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <Smartphone className="w-4 h-4" style={{ color: 'var(--violet)' }} />
          </div>
          <h3 className="text-sm font-semibold">Authenticator App</h3>
        </div>
        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text2)' }}>
          Set up Google Authenticator, Authy, or a similar app for faster step-up verification.
        </p>
        <button onClick={setup} disabled={loading} className="btn-primary flex items-center gap-1.5 text-xs">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />} Setup Authenticator
        </button>
      </div>
    );
  }

  if (step === 'scan') {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '1.25rem',
      }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <Smartphone className="w-4 h-4" style={{ color: 'var(--violet)' }} />
          </div>
          <h3 className="text-sm font-semibold">Scan QR Code</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text2)' }}>Open your authenticator app and scan:</p>
        <div className="flex justify-center mb-4">
          <div className="bg-white p-3 rounded-xl shadow-lg">
            <img src={qr} alt="QR" className="w-40 h-40" />
          </div>
        </div>
        <p className="text-[10px] mb-2" style={{ color: 'var(--muted)' }}>Or enter manually:</p>
        <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <code className="text-[11px] flex-1 break-all" style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>{secret}</code>
          <button onClick={() => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="icon-btn p-1.5">
            {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text2)' }}>Enter 6-digit code to confirm:</p>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"
          className="text-center text-lg tracking-[0.35em] mb-3" style={{ fontFamily: 'var(--mono)' }} maxLength={6} />
        <button onClick={verify} disabled={code.length !== 6 || loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Verify & Enable
        </button>
      </div>
    );
  }

  const resetTOTP = async () => {
    if (!resetPw) return toast.error('Password is required.');
    setLoading(true);
    try {
      await api.post('/stepup/totp/disable', { password: resetPw });
      toast.success('Authenticator reset. You can set up a new one.');
      setResetPw('');
      setShowReset(false);
      setStep('init');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '1.5rem',
    }}>
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <ShieldCheck className="w-6 h-6" style={{ color: 'var(--green)' }} />
        </div>
        <h3 className="text-sm font-semibold mb-1">Authenticator Enabled</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>It will be used as the primary step-up method.</p>
        {!showReset ? (
          <button onClick={() => setShowReset(true)} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg" style={{ color: 'var(--amber)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <RotateCcw className="w-3 h-3" /> Reset Authenticator
          </button>
        ) : (
          <div className="mt-3 text-left">
            <p className="text-[11px] mb-2" style={{ color: 'var(--text2)' }}>Enter your password to confirm reset:</p>
            <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder="Your password" className="mb-3 text-sm" />
            <div className="flex gap-2">
              <button onClick={resetTOTP} disabled={!resetPw || loading} className="btn-primary flex items-center gap-1.5 text-xs flex-1 justify-center">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Confirm Reset
              </button>
              <button onClick={() => { setShowReset(false); setResetPw(''); }} className="text-xs px-4 py-2 rounded-lg" style={{ color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TOTPSetup;
