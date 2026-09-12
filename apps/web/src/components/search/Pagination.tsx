import Link from 'next/link';

interface PaginationProps {
  page: number;
  totalPages: number;
  basePath: string;
  /** Current filter params (page excluded) so links preserve the query. */
  params: Record<string, string | undefined>;
}

/** Numbered pagination — plain links so it works from RSC without JS. */
export function Pagination({ page, totalPages, basePath, params }: PaginationProps) {
  if (totalPages <= 1) return null;

  const makeHref = (target: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'page') qs.set(key, value);
    }
    if (target > 1) qs.set('page', String(target));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);

  const linkClass = (active: boolean) =>
    `inline-flex h-10 min-w-10 items-center justify-center rounded-[12px] px-3 text-sm ${
      active ? 'bg-primary font-semibold text-black' : 'border border-border bg-card text-fg hover:border-primary'
    }`;

  return (
    <nav aria-label="Sahifalar" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} rel="prev" className={linkClass(false)} aria-label="Oldingi sahifa">
          ‹
        </Link>
      ) : null}
      {pages.map((p) => (
        <Link
          key={p}
          href={makeHref(p)}
          aria-current={p === page ? 'page' : undefined}
          className={linkClass(p === page)}
        >
          {p}
        </Link>
      ))}
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} rel="next" className={linkClass(false)} aria-label="Keyingi sahifa">
          ›
        </Link>
      ) : null}
    </nav>
  );
}
