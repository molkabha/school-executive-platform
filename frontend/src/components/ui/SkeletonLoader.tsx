export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line title" />
      <div className="skeleton-line text" />
      <div className="skeleton-line text short" />
    </div>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          <div className="skeleton-line" style={{ width: '30%' }} />
          <div className="skeleton-line" style={{ width: '20%' }} />
          <div className="skeleton-line" style={{ width: '15%' }} />
          <div className="skeleton-line" style={{ width: '20%' }} />
        </div>
      ))}
    </div>
  );
}
