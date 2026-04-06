import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Reusable pagination component.
 *
 * @param {number} currentPage - Current active page (1-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {function} onPageChange - Callback with new page number
 * @param {number} totalItems - Total item count (optional, for display)
 * @param {number} pageSize - Items per page (optional, for display)
 */
export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) { start = 2; end = 4; }
      if (currentPage >= totalPages - 2) { start = totalPages - 3; end = totalPages - 1; }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between gap-4 pt-3">
      {/* Info */}
      {totalItems !== undefined && pageSize && (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {Math.min((currentPage - 1) * pageSize + 1, totalItems)}\u2013{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
        </span>
      )}

      {/* Controls */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="icon-btn disabled:opacity-30"
          aria-label="First page"
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="icon-btn disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {getPageNumbers().map((page, i) =>
          page === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs" style={{ color: 'var(--muted)' }}>
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${
                page === currentPage
                  ? 'font-bold'
                  : ''
              }`}
              style={
                page === currentPage
                  ? { background: 'var(--cyan)', color: 'var(--on-accent)' }
                  : { color: 'var(--text2)' }
              }
              onMouseEnter={(e) => {
                if (page !== currentPage) e.target.style.background = 'var(--surface3)';
              }}
              onMouseLeave={(e) => {
                if (page !== currentPage) e.target.style.background = 'transparent';
              }}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="icon-btn disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="icon-btn disabled:opacity-30"
          aria-label="Last page"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
