/**
 * Shimmer skeleton components for loading states.
 * Drop-in replacements for raw spinners on tables, cards, and file lists.
 */

const shimmerStyle = {
  background: 'linear-gradient(90deg, var(--surface) 25%, var(--surface3) 50%, var(--surface) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
  borderRadius: 'var(--radius-sm)',
};

export function SkeletonLine({ width = '100%', height = '14px', className = '' }) {
  return (
    <div
      className={className}
      style={{ ...shimmerStyle, width, height, minHeight: height }}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card space-y-3 ${className}`}>
      <SkeletonLine width="40%" height="12px" />
      <SkeletonLine width="60%" height="24px" />
      <SkeletonLine width="80%" height="12px" />
    </div>
  );
}

export function SkeletonStatCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTableRow({ columns = 5 }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: '0.6rem 0.9rem' }}>
          <SkeletonLine width={i === 0 ? '70%' : '50%'} height="12px" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, columns = 5 }) {
  return (
    <div className="card overflow-hidden" style={{ padding: 0 }}>
      <table className="data-table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <SkeletonLine width="60%" height="10px" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonFileList({ count = 6 }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="file-row" style={{ opacity: 1 - i * 0.1 }}>
          <SkeletonLine width="32px" height="32px" className="flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonLine width={`${60 + Math.random() * 30}%`} height="13px" />
            <SkeletonLine width="30%" height="10px" />
          </div>
          <SkeletonLine width="24px" height="24px" className="flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
