import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Shield, Eye, EyeOff, CheckCircle, KeyRound } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const valid = password.length >= 8 && password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="auth-bg" />
        <div className="animate-scale text-center" style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(239,68,68,0.15)', borderRadius: '20px',
          padding: '2.5rem', maxWidth: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <p className="text-sm font-medium mb-4" style={{ color: 'var(--red)' }}>Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="btn-primary text-xs inline-block">Request new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="auth-bg" />
      <div className="mesh-bg" />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="text-center mb-8 anim-1">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{
            background: 'rgba(6,182,212,0.08)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(6,182,212,0.2)', boxShadow: '0 0 40px rgba(6,182,212,0.1)',
          }}>
            <Shield className="w-6 h-6" style={{ color: 'var(--cyan)' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">New Password</h1>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Choose a strong password</p>
        </div>

        <div className="anim-2" style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px',
          padding: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          {done ? (
            <div className="text-center py-6 animate-scale">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <CheckCircle className="w-7 h-7" style={{ color: 'var(--green)' }} />
              </div>
              <h3 className="text-sm font-semibold mb-2">Password Reset</h3>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label block mb-2">New Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required className="pr-10" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.05)]" style={{ color: 'var(--muted)' }}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label block mb-2">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required />
                {confirm && password !== confirm && <p className="text-[10px] mt-1.5 font-medium" style={{ color: 'var(--red)' }}>Passwords don't match</p>}
              </div>
              <button type="submit" disabled={!valid || loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
