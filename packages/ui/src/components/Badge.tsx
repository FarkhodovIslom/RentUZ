import type { ReactNode } from 'react';
import { cn } from '../cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'error' | 'info' | 'outline';

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-elevated text-fg-secondary',
  primary: 'bg-primary text-black',
  success: 'bg-success text-white',
  error: 'bg-error text-white',
  info: 'bg-info text-white',
  outline: 'border border-border text-fg-secondary',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
