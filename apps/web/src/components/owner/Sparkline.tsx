'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatDayTak } from '@/lib/format';

/** 14-day views trend under the dashboard KPIs (§31). */
export function Sparkline({ series }: { series: Array<{ date: string; views: number }> }) {
  if (series.length === 0) return null;
  const data = series.map((p) => ({ ...p, label: formatDayTak(`${p.date}T00:00:00+05:00`) }));
  return (
    <div className="h-16 w-full" data-testid="sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" hide />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="rounded-[8px] border border-border bg-elevated px-2 py-1 text-xs">
                  {String(payload[0].payload?.label ?? '')}: {String(payload[0].value)}
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="views" stroke="#ffa31a" fill="#ffa31a22" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
