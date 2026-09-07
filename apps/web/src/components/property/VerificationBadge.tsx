export function VerificationBadge({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Tasdiqlangan e'lon"
      className={
        'inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-black shadow-sm ' +
        className
      }
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}
