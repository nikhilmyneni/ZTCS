import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, Shield, Check, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

const SQ = ["What is your pet's name?", "What city were you born in?", "What was your first school?", "What is your mother's maiden name?", "What is your favorite movie?"];

const RegisterPage = () => {
  const [f, setF] = useState({ name: '', email: '', password: '', confirmPassword: '', secretQuestion: SQ[0], secretAnswer: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const pw = f.password;
  const ck = { len: pw.length >= 8, up: /[A-Z]/.test(pw), lo: /[a-z]/.test(pw), num: /\d/.test(pw), match: pw && pw === f.confirmPassword };
  const valid = f.name && f.email && Object.values(ck).every(Boolean) && f.secretAnswer;
  const ch = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));
  const strength = Object.values(ck).filter(Boolean).length;
  const strengthColor = strength <= 2 ? 'var(--red)' : strength <= 3 ? 'var(--amber)' : 'var(--green)';

  const submit = async e => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      await register({ name: f.name, email: f.email, password: f.password, secretQuestion: f.secretQuestion, secretAnswer: f.secretAnswer });
      toast.success('Account created.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--bg)' }}>
      <div className="auth-bg" />
      <div className="mesh-bg" />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-8 anim-1">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{
            background: 'rgba(6,182,212,0.08)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(6,182,212,0.2)', boxShadow: '0 0 40px rgba(6,182,212,0.1)',
          }}>
            <Shield className="w-6 h-6" style={{ color: 'var(--cyan)' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create Account</h1>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Secure your data with Zero Trust</p>
        </div>

        {/* Glass card */}
        <div className="anim-2" style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px',
          padding: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="label block mb-2">Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input id="reg-name" name="name" value={f.name} onChange={ch} placeholder="John Doe" required />
            </div>
            <div>
              <label htmlFor="reg-email" className="label block mb-2">Email <span style={{ color: 'var(--red)' }}>*</span></label>
              <input id="reg-email" type="email" name="email" value={f.email} onChange={ch} placeholder="you@example.com" required />
            </div>
            <div>
              <label htmlFor="reg-password" className="label block mb-2">Password <span style={{ color: 'var(--red)' }}>*</span></label>
              <div className="relative">
                <input id="reg-password" type={showPw ? 'text' : 'password'} name="password" value={f.password} onChange={ch} placeholder="Min 8 characters" required className="pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.05)]" style={{ color: 'var(--muted)' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pw && (
                <>
                  <div className="flex gap-1 mt-2.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300" style={{ background: i <= strength ? strengthColor : 'var(--surface3)' }} />
                    ))}
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[{ k: 'len', l: '8+ characters' }, { k: 'up', l: 'Uppercase' }, { k: 'lo', l: 'Lowercase' }, { k: 'num', l: 'Number' }].map(({ k, l }) => (
                      <div key={k} className="flex items-center gap-1.5 text-[10px] transition-colors" style={{ color: ck[k] ? 'var(--green)' : 'var(--muted2)' }}>
                        <Check className="w-3 h-3" />{l}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label htmlFor="reg-confirm" className="label block mb-2">Confirm Password <span style={{ color: 'var(--red)' }}>*</span></label>
              <input id="reg-confirm" type="password" name="confirmPassword" value={f.confirmPassword} onChange={ch} placeholder="Re-enter password" required />
              {f.confirmPassword && !ck.match && <p className="text-[10px] mt-1.5 font-medium" style={{ color: 'var(--red)' }}>Passwords don't match</p>}
            </div>

            <div className="pt-3 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="label mb-3">Security Question (Step-Up Verification)</p>
              <select name="secretQuestion" value={f.secretQuestion} onChange={ch} className="text-sm mb-3">
                {SQ.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
              <label htmlFor="reg-answer" className="label block mb-2">Answer <span style={{ color: 'var(--red)' }}>*</span></label>
              <input id="reg-answer" name="secretAnswer" value={f.secretAnswer} onChange={ch} placeholder="Your answer" required />
            </div>

            <button type="submit" disabled={!valid || loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
          <div className="divider my-5" />
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            Already have an account? <Link to="/login" className="font-semibold transition-colors hover:brightness-125" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
