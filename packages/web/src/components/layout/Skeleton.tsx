export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div data-testid="skeleton" className="space-y-3" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 rounded skeleton-shimmer"
          style={{
            width: i === lines - 1 ? '60%' : '100%',
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}
