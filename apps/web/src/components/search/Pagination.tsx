'use client';

import Link from 'next/link';
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  basePath: string;
  /** Current filter params (page excluded) so links preserve the query. */
  params: Record<string, string | undefined>;
}

/**
 * Numbered pagination — plain links so it works from RSC without JS.
 * Arrow-key roving focus inside the nav (§7 keyboard operability): Left/
 * Right move focus between page links; the browser follows the link on
 * Enter as usual. Mouse behavior unchanged.
 */
export function Pagination({ page, totalPages, basePath, params }: PaginationProps) {
  const navRef = useRef<HTMLElement>(null);
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

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const links = Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []);
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index === -1) return;
    const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
    if (next >= 0 && next < links.length) {
      event.preventDefault();
      links[next]!.focus();
    }
  };

  return (
    <nav ref={navRef} aria-label="Sahifalar" onKeyDown={onKeyDown} className="mt-8 flex flex-wrap items-center justify-center gap-2">
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
