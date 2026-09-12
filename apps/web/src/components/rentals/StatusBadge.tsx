import { Badge, type BadgeVariant } from '@rentuz/ui';

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Kutayotgan', variant: 'neutral' },
  ACCEPTED: { label: 'Qabul qilingan', variant: 'primary' }, // §3 yellow accent
  ACTIVE: { label: 'Faol ijara', variant: 'primary' },
  REJECTED: { label: 'Rad etilgan', variant: 'error' },
  CANCELLED: { label: 'Bekor qilingan', variant: 'neutral' },
  EXPIRED: { label: "Muddati o'tgan", variant: 'outline' },
  COMPLETED: { label: 'Yakunlangan', variant: 'success' },
};

/** §1.3 item 18 — status chip; ACCEPTED/ACTIVE carry the yellow accent. */
export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
