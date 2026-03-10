import { FileX, Inbox, ShieldCheck, Clock, Search } from 'lucide-react';

const icons = {
  files: FileX,
  inbox: Inbox,
  security: ShieldCheck,
  history: Clock,
  search: Search,
};

/**
 * Consistent empty state with icon + description for list views.
 *
 * @param {string} icon - One of: files, inbox, security, history, search
 * @param {string} title - Main heading
 * @param {string} description - Supporting text
 * @param {React.ReactNode} action - Optional action button
 */
export default function EmptyState({
  icon = 'inbox',
  title = 'No data yet',
  description = '',
  action,
}) {
  const Icon = icons[icon] || Inbox;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
        }}
      >
        <Icon size={24} style={{ color: 'var(--muted)' }} />
      </div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text2)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-xs max-w-xs" style={{ color: 'var(--muted)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
