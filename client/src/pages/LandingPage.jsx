import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Activity, Users, Lock, ArrowRight, Fingerprint, Globe, Zap, Eye, ShieldCheck, BarChart3, Cpu } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const LandingPage = () => {
  const [stats, setStats] = useState({ users: 0, sessions: 0, threats: 0, files: 0 });
  const canvasRef = useRef(null);

  // Fetch real stats from API, then animate counter
  useEffect(() => {
    const animate = (targets) => {
      const duration = 2200, start = Date.now();
      const timer = setInterval(() => {
        const p = Math.min((Date.now() - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 4);
        setStats({
          users: Math.round(targets.users * e),
          sessions: Math.round(targets.sessions * e),
          threats: Math.round(targets.threats * e),
          files: Math.round(targets.files * e),
        });
        if (p >= 1) clearInterval(timer);
      }, 16);
      return timer;
    };

    let timer;
    axios.get(`${API_BASE}/public/stats`)
      .then(({ data }) => {
        const t = data.data || {};
        timer = animate({
          users: t.users || 0,
          sessions: t.sessions || 0,
          threats: t.threats || 0,
          files: t.files || 0,
        });
      })
      .catch(() => {
        // Fallback to zeros if API unavailable
        timer = animate({ users: 0, sessions: 0, threats: 0, files: 0 });
      });
    return () => clearInterval(timer);
  }, []);

  // Trace particle animation on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let w, h;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Trace particles
    const particleCount = w < 768 ? 25 : 60;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
      color: Math.random() > 0.6 ? '139,92,246' : '6,182,212',
    }));

    // Trace lines between nearby particles
    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${p.opacity})`;
        ctx.fill();
      });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(6,182,212,${0.06 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const tickerItems = [
    { icon: ShieldCheck, label: 'Zero Trust Architecture', color: 'var(--cyan)' },
    { icon: BarChart3, label: 'UEBA Analytics', color: 'var(--violet)' },
    { icon: Fingerprint, label: 'Device Fingerprinting', color: 'var(--pink)' },
    { icon: Activity, label: 'Risk Scoring', color: 'var(--red)' },
    { icon: Zap, label: 'Multi-Factor Auth', color: 'var(--amber2)' },
    { icon: Eye, label: 'Real-Time Monitoring', color: 'var(--green)' },
    { icon: Globe, label: 'Geo-IP Intelligence', color: 'var(--violet2)' },
  ];


  return (
    <div className="min-h-screen relative flex flex-col justify-center overflow-x-hidden" style={{ background: 'var(--bg)' }}>
      {/* Canvas for trace animations */}
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

      {/* Liquid morphism blobs */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: '45vw', height: '45vw', maxWidth: 500, maxHeight: 500,
          top: '-10%', left: '-5%', borderRadius: '40% 60% 55% 45% / 55% 40% 60% 45%',
          background: 'radial-gradient(ellipse, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.02) 60%, transparent 80%)',
          filter: 'blur(40px)',
          animation: 'morphBlob1 18s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: '40vw', height: '40vw', maxWidth: 450, maxHeight: 450,
          bottom: '-8%', right: '-5%', borderRadius: '55% 45% 40% 60% / 45% 55% 45% 55%',
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.02) 55%, transparent 75%)',
          filter: 'blur(40px)',
          animation: 'morphBlob2 20s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: '30vw', height: '30vw', maxWidth: 350, maxHeight: 350,
          top: '40%', left: '50%', transform: 'translateX(-50%)', borderRadius: '45% 55% 50% 50% / 50% 45% 55% 50%',
          background: 'radial-gradient(ellipse, rgba(236,72,153,0.06) 0%, transparent 65%)',
          filter: 'blur(50px)',
          animation: 'morphBlob3 22s ease-in-out infinite',
        }} />
      </div>

      {/* CSS for blob morphing */}
      <style>{`
        @keyframes morphBlob1 {
          0%,100% { border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%; transform: translate(0,0) scale(1); }
          25% { border-radius: 55% 45% 40% 60% / 40% 55% 45% 55%; transform: translate(3%,5%) scale(1.05); }
          50% { border-radius: 45% 55% 60% 40% / 60% 45% 55% 45%; transform: translate(-2%,3%) scale(0.97); }
          75% { border-radius: 60% 40% 45% 55% / 45% 60% 40% 55%; transform: translate(4%,-2%) scale(1.03); }
        }
        @keyframes morphBlob2 {
          0%,100% { border-radius: 55% 45% 40% 60% / 45% 55% 45% 55%; transform: translate(0,0) scale(1); }
          33% { border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%; transform: translate(-4%,3%) scale(1.04); }
          66% { border-radius: 50% 50% 45% 55% / 50% 50% 50% 50%; transform: translate(3%,-4%) scale(0.96); }
        }
        @keyframes morphBlob3 {
          0%,100% { border-radius: 45% 55% 50% 50% / 50% 45% 55% 50%; transform: translateX(-50%) scale(1); }
          50% { border-radius: 55% 45% 45% 55% / 45% 55% 50% 50%; transform: translateX(-50%) scale(1.08) translateY(-5%); }
        }
        @keyframes traceGlow {
          0% { opacity: 0; transform: translateX(-100%); }
          50% { opacity: 1; }
          100% { opacity: 0; transform: translateX(100%); }
        }
      `}</style>

      {/* Hero */}
      <section className="relative z-10 text-center px-5 sm:px-6 pt-10 sm:pt-16 pb-8 sm:pb-12 max-w-4xl mx-auto">

        <h1 className="anim-2" style={{ fontSize: 'clamp(2.2rem, 7vw, 5rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
          <span style={{ color: 'var(--text)' }}>Zero Trust</span>
          <span className="gradient-text">.</span>
          <br />
          <span style={{ color: 'var(--text)' }}>Cloud System</span>
          <span className="gradient-text"></span>
        </h1>

        <p className="anim-3 mt-5 sm:mt-7 text-sm sm:text-base leading-relaxed max-w-xl mx-auto" style={{ color: 'var(--text2)' }}>
          Cloud storage with built-in behavioral analytics.
          Every access attempt is scored and verified in real time.
        </p>

        <div className="anim-4 flex flex-col sm:flex-row justify-center gap-3 mt-8 sm:mt-10">
          <Link to="/register" className="btn-primary px-7 sm:px-8 py-3 sm:py-3.5 text-sm flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> Start Secure
          </Link>
          <Link to="/login" className="btn-secondary px-7 sm:px-8 py-3 sm:py-3.5 text-sm text-center">Sign In</Link>
        </div>

        {/* Trace line animation under hero */}
        <div className="anim-5 mt-10 sm:mt-14 relative h-px max-w-lg mx-auto overflow-hidden" style={{ background: 'var(--border)' }}>
          <div style={{
            position: 'absolute', inset: 0, width: '40%',
            background: 'linear-gradient(90deg, transparent, var(--cyan), transparent)',
            animation: 'traceGlow 3s ease-in-out infinite',
          }} />
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pb-10 sm:pb-14">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { v: stats.sessions, l: 'Sessions Monitored', icon: Activity, color: 'var(--cyan)' },
            { v: stats.users, l: 'Active Users', icon: Users, color: 'var(--green)' },
            { v: stats.threats, l: 'Threats Blocked', icon: Shield, color: 'var(--red)' },
          ].map(({ v, l, icon: Icon, color }) => (
            <div key={l} className="hover-lift text-center" style={{
              background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius)',
              padding: '1rem 0.75rem',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}>
              <Icon className="w-4 sm:w-5 h-4 sm:h-5 mx-auto mb-2 sm:mb-3" style={{ color }} />
              <p className="text-xl sm:text-3xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{v.toLocaleString()}</p>
              <p className="text-[9px] sm:text-[10px] mt-1 font-semibold tracking-wider uppercase" style={{ color: 'var(--muted)' }}>{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Technologies Ticker */}
      <section className="relative z-10 pb-6 sm:pb-10 overflow-hidden"
        style={{ WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
        <div className="flex w-max" style={{ animation: 'ticker-scroll 40s linear infinite' }}>
          {[0, 1].map(copy => (
            <div key={copy} className="flex shrink-0">
              {tickerItems.map(({ icon: Icon, label, color }, i) => (
                <div key={i} className="flex items-center gap-2 shrink-0 mx-5 sm:mx-7">
                  <Icon className="w-3.5 h-3.5" style={{ color, opacity: 0.7 }} />
                  <span className="text-[10px] sm:text-[11px] whitespace-nowrap" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 shrink-0 mx-5 sm:mx-7">
                <svg className="w-3.5 h-3.5" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M44.1 45.6l1.3-4.5c.3-.9.2-1.8-.3-2.4-.4-.6-1.2-1-2-1l-20.2-.3c-.2 0-.3-.1-.4-.2-.1-.1-.1-.3 0-.4.1-.2.2-.3.4-.3l20.4-.3c2-.1 4.1-1.7 4.8-3.6l1-2.6c.1-.2.1-.4.1-.5-1.3-7.3-7.8-12.8-15.5-12.8-7 0-12.9 4.5-15 10.8-1.4-1-3.1-1.5-5-1.2-3.2.5-5.7 3.1-6.1 6.3-.1.8-.1 1.5 0 2.3-4.5.1-8.1 3.8-8.1 8.4 0 .5 0 .9.1 1.4.1.3.3.5.6.5h43.3c.2 0 .5-.2.6-.4l.1-.2z" fill="#f6821f" opacity="0.7"/>
                  <path d="M52.1 28.8h-.7c-.2 0-.3.1-.4.3l-1 3.5c-.3.9-.2 1.8.3 2.4.4.6 1.2 1 2 1l3.6.3c.2 0 .3.1.4.2.1.1.1.3 0 .4-.1.2-.2.3-.4.3l-3.8.3c-2 .1-4.1 1.7-4.8 3.6l-.4 1.1c-.1.2 0 .4.2.4h15.2c.2 0 .5-.1.5-.4.4-1.4.6-2.8.6-4.4 0-5.5-4.4-9.9-9.9-10h-1.4z" fill="#f6821f" opacity="0.7"/>
                </svg>
                <span className="text-[10px] sm:text-[11px] whitespace-nowrap" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontWeight: 500 }}>Protected by Cloudflare</span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};

export default LandingPage;
