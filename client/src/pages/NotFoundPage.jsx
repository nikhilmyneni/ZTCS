import { Link } from 'react-router-dom';
import { Home, ArrowLeft, ShieldOff } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: 'var(--bg)' }}>
      <div className="auth-bg" />
      <div className="card-elevated text-center max-w-lg w-full space-y-8 animate-in relative z-10">
        {/* Icon */}
        <div
          className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <ShieldOff size={36} style={{ color: 'var(--violet)' }} />
        </div>

        {/* Error code */}
        <div>
          <h1
            className="text-6xl font-black mb-3"
            style={{
              background: 'linear-gradient(135deg, var(--cyan) 0%, var(--violet) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            404
          </h1>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
            Page Not Found
          </h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            This page doesn't exist or may have been moved.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center flex-wrap">
          <Link to="/" className="btn-primary flex items-center gap-2 no-underline">
            <Home size={14} />
            Go Home
          </Link>
          <button onClick={() => window.history.back()} className="btn-secondary flex items-center gap-2">
            <ArrowLeft size={14} />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
