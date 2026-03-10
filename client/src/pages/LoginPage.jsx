import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, Shield, ArrowRight, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import StepUpModal from '../components/auth/StepUpModal';
import api from '../utils/api';

const SIMULATION_PRESETS = {
  none: { label: 'No Simulation', simulation: null },
  unusual_time: {
    label: 'V3: Unusual Login Time (3 AM)',
    simulation: { login_time: new Date(new Date().setHours(3, 0, 0, 0)).toISOString(), timezone: 'Asia/Kolkata' },
  },
  new_country: {
    label: 'V4: New Country (USA)',
    simulation: { country: 'US', city: 'New York', region: 'New York', loc: '40.7128,-74.0060', timezone: 'America/New_York' },
  },
  impossible_travel: {
    label: 'V4: Impossible Travel (India → USA)',
    simulation: { country: 'US', city: 'New York', region: 'New York', loc: '40.7128,-74.0060', timezone: 'America/New_York' },
  },
  unusual_time_new_country: {
    label: 'V3+V4: Unusual Time + New Country',
    simulation: {
      login_time: new Date(new Date().setHours(3, 0, 0, 0)).toISOString(),
      country: 'US', city: 'New York', region: 'New York',
      loc: '40.7128,-74.0060', timezone: 'America/New_York',
    },
  },
};

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showStepUp, setShowStepUp] = useState(false);
  const [stepUpData, setStepUpData] = useState({});
  const [showSimPanel, setShowSimPanel] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('none');
  const { login, completeStepUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const simulation = SIMULATION_PRESETS[selectedPreset]?.simulation || null;
      const result = await login(email, password, simulation);

      if (result.stepUpRequired) {
        // Step-up required — show verification modal, do NOT navigate
        setStepUpData({
          secretQuestion: result.data.user?.secretQuestion,
          requiredChallenges: result.data.requiredChallenges || [],
          challengeReason: result.data.challengeReason || '',
          user: result.data.user,
        });
        setShowStepUp(true);
        toast('Identity verification required.', { icon: '!' });
        return;
      }

      const risk = result.data.riskAssessment;
      const ctx = result.data.loginContext;
      if (ctx?.isNewIP || ctx?.isNewDevice) toast('New device or location detected.', { icon: '!' });
      else toast.success('Welcome back.');
      const user = result.data.user;
      navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleStepUpVerified = async () => {
    setShowStepUp(false);
    // After step-up, fetch the real user data with the new tokens
    try {
      const { data } = await api.get('/auth/me');
      completeStepUp(
        localStorage.getItem('accessToken'),
        localStorage.getItem('refreshToken'),
        data.data.user
      );
      toast.success('Identity verified. Welcome back.');
      navigate(data.data.user?.role === 'admin' ? '/admin' : '/dashboard');
    } catch {
      toast.success('Verified. Welcome back.');
      if (stepUpData.user) completeStepUp(localStorage.getItem('accessToken'), localStorage.getItem('refreshToken'), stepUpData.user);
      navigate(stepUpData.user?.role === 'admin' ? '/admin' : '/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="auth-bg" />
      <div className="mesh-bg" />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo / Header */}
        <div className="text-center mb-8 anim-1">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{
            background: 'rgba(6,182,212,0.08)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(6,182,212,0.2)', boxShadow: '0 0 40px rgba(6,182,212,0.1)',
          }}>
            <Shield className="w-6 h-6" style={{ color: 'var(--cyan)' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Sign in to your secure account</p>
        </div>

        {/* Simulation Panel (dev only) */}
        {import.meta.env.DEV && (
          <div className="anim-2 mb-4" style={{
            background: 'rgba(245,158,11,0.05)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px',
            padding: '1rem', overflow: 'hidden',
          }}>
            <button
              type="button"
              onClick={() => setShowSimPanel(!showSimPanel)}
              className="flex items-center justify-between w-full text-left"
              style={{ color: 'rgba(245,158,11,0.9)' }}
            >
              <span className="flex items-center gap-2 text-xs font-semibold">
                <FlaskConical className="w-3.5 h-3.5" />
                UEBA Simulation
                {selectedPreset !== 'none' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                    background: 'rgba(245,158,11,0.15)', color: 'rgb(245,158,11)',
                  }}>ACTIVE</span>
                )}
              </span>
              {showSimPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showSimPanel && (
              <div className="mt-3 space-y-2">
                {Object.entries(SIMULATION_PRESETS).map(([key, { label }]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-xs py-1" style={{ color: 'var(--text)' }}>
                    <input
                      type="radio"
                      name="sim-preset"
                      checked={selectedPreset === key}
                      onChange={() => setSelectedPreset(key)}
                      className="accent-amber-500"
                    />
                    {label}
                  </label>
                ))}
                <p className="text-[10px] mt-2" style={{ color: 'var(--muted)' }}>
                  Overrides geo/time data sent to UEBA engine. Only works in dev mode.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Glass card */}
        <div className="anim-2" style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px',
          padding: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label block mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label">Password</label>
                <Link to="/forgot-password" className="text-[10px] font-medium transition-colors hover:brightness-125" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>Forgot?</Link>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required className="pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.05)]" style={{ color: 'var(--muted)' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? 'Verifying identity...' : 'Sign In'}
            </button>
          </form>
          <div className="divider my-5" />
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            No account? <Link to="/register" className="font-semibold transition-colors hover:brightness-125" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>Create one</Link>
          </p>
        </div>
      </div>

      <StepUpModal
        isOpen={showStepUp}
        onClose={() => setShowStepUp(false)}
        onVerified={handleStepUpVerified}
        secretQuestion={stepUpData.secretQuestion}
        requiredChallenges={stepUpData.requiredChallenges}
        challengeReason={stepUpData.challengeReason}
      />
    </div>
  );
};

export default LoginPage;
