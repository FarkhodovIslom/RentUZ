import { cn } from '../cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-[12px] bg-elevated', className)} />;
}
