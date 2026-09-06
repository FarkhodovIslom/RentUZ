import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty state — spec §66 requires every empty state to end with an action.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border bg-card px-6 py-16 text-center',
        className,
      )}
    >
      {icon ? <div aria-hidden className="text-fg-muted">{icon}</div> : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-fg-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
