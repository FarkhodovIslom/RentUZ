import { cn } from '@rentuz/ui/cn';

/** §34 KPI tile: label + value + optional sparkline footer (owner dashboard + analytics strip). */
export function KpiCard({
  label,
  value,
  hint,
  className,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn('rounded-[12px] border border-border bg-card p-4', className)} data-testid={`kpi-${label}`}>
      <p className="text-xs uppercase text-fg-muted">{label}</p>
      <p className={cn('mt-2 text-2xl font-bold', accent && 'text-primary')}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-fg-muted">{hint}</p>}
    </div>
  );
}
