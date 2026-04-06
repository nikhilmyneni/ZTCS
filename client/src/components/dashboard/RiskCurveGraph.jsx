import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import { io } from 'socket.io-client';
import api from '../../utils/api';

const ACTION_LABELS = {
  login_success: 'Login',
  login_initiated: 'Login (Step-Up)',
  login_blocked: 'Blocked',
  login: 'Login',
  file_upload: 'Upload',
  file_download: 'Download',
  file_delete: 'Delete',
  file_op: 'File Op',
  bulk_download: 'Bulk Download',
  bulk_download_detected: 'Bulk Download',
  step_up_triggered: 'Step-Up',
  session_terminated: 'Terminated',
  user_auto_blocked: 'Auto-Blocked',
  auto_blocked: 'Auto-Blocked',
  blocked: 'Blocked',
};

const formatLocalTime = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const c = d.score <= 30 ? 'var(--green)' : d.score <= 60 ? 'var(--amber)' : 'var(--red)';
  const actionLabel = ACTION_LABELS[d.action] || d.action || '';
  return (
    <div style={{
      background: 'var(--toast-bg)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{d.email || d.label}</p>
      <p className="text-lg font-bold" style={{ color: c, fontFamily: 'var(--mono)' }}>{d.score}</p>
      <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{d.time}{actionLabel ? ` · ${actionLabel}` : ''}{d.ip ? ` · ${d.ip}` : ''}</p>
    </div>
  );
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const RiskCurveGraph = ({ height = 240, showTitle = true, isAdmin = false, liveOnly = false }) => {
  const [dataPoints, setDataPoints] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (liveOnly) { setLoaded(true); return; }
    const endpoint = isAdmin ? '/admin/risk-scores' : '/auth/my-risk-scores';
    const fetchScores = async () => {
      try {
        const { data } = await api.get(endpoint);
        if (data.data?.dataPoints?.length) {
          setDataPoints(data.data.dataPoints.map(pt => ({
            ...pt,
            score: Math.min(pt.score ?? 0, 100),
            time: pt.time || formatLocalTime(pt.timestamp),
          })));
        }
      } catch {}
      setLoaded(true);
    };
    fetchScores();
    const interval = setInterval(fetchScores, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, liveOnly]);

  useEffect(() => {
    if (!loaded) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    if (isAdmin) socket.emit('join-admin');
    const add = (event, action) => {
      setDataPoints(prev => {
        const pt = {
          session: prev.length + 1,
          score: Math.min(event.riskScore ?? 0, 100),
          level: event.riskLevel || 'low',
          email: event.email || '',
          time: formatLocalTime(event.timestamp || new Date().toISOString()),
          ip: event.ipAddress || '',
          action,
        };
        return [...prev, pt].slice(-100);
      });
    };
    socket.on('login-event', e => add(e, 'login'));
    socket.on('risk-update', e => add(e, e.action || 'file_op'));
    socket.on('bulk-download', e => add({ ...e, riskScore: e.riskScore ?? 60, riskLevel: e.riskLevel || 'medium' }, 'bulk_download'));
    socket.on('session-blocked', e => add({ ...e, riskLevel: 'high' }, 'blocked'));
    socket.on('user-auto-blocked', e => add({ ...e, riskLevel: 'high' }, 'auto_blocked'));
    return () => socket.disconnect();
  }, [isAdmin, loaded]);

  const avg = dataPoints.length ? Math.round(dataPoints.reduce((s, p) => s + p.score, 0) / dataPoints.length) : 0;
  const stroke = avg > 60 ? 'var(--red)' : avg > 30 ? 'var(--amber)' : 'var(--green)';
  const fillId = avg > 60 ? 'hg' : avg > 30 ? 'mg' : 'lg';

  // Risk distribution for pie chart
  const distribution = useMemo(() => {
    if (!dataPoints.length) return [];
    const low = dataPoints.filter(p => p.score <= 30).length;
    const med = dataPoints.filter(p => p.score > 30 && p.score <= 60).length;
    const high = dataPoints.filter(p => p.score > 60).length;
    return [
      { name: 'Low', value: low, color: '#10b981' },
      { name: 'Medium', value: med, color: '#f59e0b' },
      { name: 'High', value: high, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [dataPoints]);

  const total = dataPoints.length;

  // Per-dot coloring based on each point's own score
  const renderDot = (props) => {
    const { cx, cy, payload } = props;
    const s = payload?.score ?? 0;
    const fill = s > 60 ? 'var(--red)' : s > 30 ? 'var(--amber)' : 'var(--green)';
    return <circle cx={cx} cy={cy} r={2.5} fill={fill} strokeWidth={0} />;
  };
  const renderActiveDot = (props) => {
    const { cx, cy, payload } = props;
    const s = payload?.score ?? 0;
    const fill = s > 60 ? 'var(--red)' : s > 30 ? 'var(--amber)' : 'var(--green)';
    return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="var(--bg)" strokeWidth={2} />;
  };

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} fontFamily="var(--mono)">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-4">
      {/* Risk Score Trend */}
      <div style={{
        background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '1.25rem',
      }}>
        {showTitle && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold">
                Risk Score Trend{isAdmin && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · All Users</span>}
              </h3>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                {dataPoints.length} sessions · Avg: {avg}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="dot-pulse" style={{ background: isAdmin ? 'var(--red)' : 'var(--green)' }} />
              <span className="text-[10px]" style={{ color: isAdmin ? 'var(--red)' : 'var(--muted)', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                {isAdmin ? 'LIVE' : 'Live'}
              </span>
            </div>
          </div>
        )}
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart key={dataPoints.length} data={dataPoints} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="time" stroke="var(--muted2)" tick={{ fontSize: 9, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} allowDataOverflow stroke="var(--muted2)" tick={{ fontSize: 9, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={30} stroke="var(--green)" strokeOpacity={0.15} />
            <ReferenceLine y={60} stroke="var(--amber)" strokeOpacity={0.15} />
            <Area type="monotone" dataKey="score" stroke={stroke} fill={`url(#${fillId})`} strokeWidth={2} dot={renderDot} activeDot={renderActiveDot} isAnimationActive animationDuration={3000} animationEasing="ease-in-out" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-3 sm:gap-4 mt-3 flex-wrap">
          {[{ c: 'var(--green)', l: 'Low <=30' }, { c: 'var(--amber)', l: 'Med <=60' }, { c: 'var(--red)', l: 'High >60' }].map(({ c, l }) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded" style={{ background: c }} />
              <span className="text-[9px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{l}</span>
            </div>
          ))}
          {isAdmin && avg > 0 && (
            <span className="ml-auto text-[10px] font-semibold" style={{ color: avg <= 30 ? 'var(--green)' : avg <= 60 ? 'var(--amber)' : 'var(--red)', fontFamily: 'var(--mono)' }}>Avg: {avg}</span>
          )}
        </div>
      </div>

      {/* Risk Distribution Pie */}
      {distribution.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '1.25rem',
        }}>
          <h3 className="text-xs font-semibold mb-1">Risk Distribution</h3>
          <p className="text-[10px] mb-3" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {total} sessions analyzed
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={distribution}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={65}
                paddingAngle={3}
                dataKey="value"
                label={renderPieLabel}
                labelLine={false}
                isAnimationActive
                animationDuration={1200}
              >
                {distribution.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2">
            {distribution.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-[10px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {d.name} <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{d.value}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskCurveGraph;
