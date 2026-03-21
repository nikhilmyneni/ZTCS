import { ResponsiveContainer, LineChart, Line } from 'recharts';

export const RiskBadge = ({ level }) => {
  const cls = level === 'low' ? 'risk-low' : level === 'medium' ? 'risk-medium' : level === 'high' ? 'risk-high' : '';
  return (
    <span className={cls || 'text-xs px-2 py-0.5 rounded-full'} style={!['low', 'medium', 'high'].includes(level) ? { color: 'var(--muted)', background: 'var(--surface)' } : {}}>
      {(level || '\u2014').toUpperCase()}
    </span>
  );
};

export const Spark = ({ data, color = 'var(--cyan)' }) => (
  <ResponsiveContainer width={60} height={24}>
    <LineChart data={data}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

export const CTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(18,18,30,0.95)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      {payload[0]?.name}: <strong>{payload[0]?.value}</strong>
    </div>
  );
};

export const glass = {
  background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};

export const SectionHeader = ({ icon: Icon, title, subtitle, color, bgColor, action }) => (
  <div className="flex items-center justify-between px-4 sm:px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bgColor, border: `1px solid ${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
    </div>
    {action && action}
  </div>
);

export const getEventLabel = (e) => {
  if (e.action === 'blocked' || e.action === 'auto_blocked') return 'Blocked';
  if (e.action === 'ip_blocked') return 'IP Blocked';
  if (e.action === 'file_upload') return 'Upload';
  if (e.action === 'file_download') return 'Download';
  if (e.action === 'file_delete') return 'Delete';
  if (e.action === 'bulk_download') return 'Bulk Download';
  if (e.action === 'step_up' || e.action === 'step_up_triggered') return 'Step-Up';
  if (e.action === 'session_revoked') return 'Session Revoked';
  if (e.action === 'device_trusted') return 'Device Trusted';
  return 'Login';
};
