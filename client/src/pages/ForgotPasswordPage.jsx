import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Shield, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-bold tracking-tight">Reset Password</h1>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>We'll send you a reset link</p>
        </div>

        <div className="anim-2" style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px',
          padding: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          {sent ? (
            <div className="text-center py-6 animate-scale">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <CheckCircle className="w-7 h-7" style={{ color: 'var(--green)' }} />
              </div>
              <h3 className="text-sm font-semibold mb-2">Check your email</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                If an account exists for <strong style={{ color: 'var(--text2)' }}>{email}</strong>, you'll receive a password reset link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label block mb-2">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}
          <div className="divider my-5" />
          <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs transition-colors hover:brightness-125" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            <ArrowLeft className="w-3 h-3" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
