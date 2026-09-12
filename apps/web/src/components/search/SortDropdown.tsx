'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SORT_OPTIONS } from './filter-utils';

/** Sort lives in the URL (§63) — the RSC page refetches on change. */
export function SortDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('sort') ?? 'newest';

  const onChange = (value: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete('page'); // filters/sort reset pagination
    if (value === 'newest') qs.delete('sort');
    else qs.set('sort', value);
    const s = qs.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  };

  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-sm">
      <span className="sr-only">Saralash</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm outline-none"
        aria-label="Saralash"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
