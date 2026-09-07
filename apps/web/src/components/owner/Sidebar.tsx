'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SidebarItem {
  href: string;
  label: string;
  exact?: boolean;
  soon?: boolean;
}

export function Sidebar({ items, userName }: { items: SidebarItem[]; userName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="border-b border-border px-5 py-5">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Rent<span className="text-primary">UZ</span>
        </Link>
        <p className="mt-2 truncate text-xs text-fg-muted">{userName}</p>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Owner navigation">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.soon ? '#' : item.href}
              aria-disabled={item.soon}
              className={[
                'flex items-center justify-between rounded-[12px] px-3 py-2 text-sm transition-colors',
                item.soon
                  ? 'cursor-not-allowed text-fg-muted'
                  : active
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-fg-secondary hover:bg-elevated hover:text-fg',
              ].join(' ')}
            >
              <span>{item.label}</span>
              {item.soon ? (
                <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] uppercase text-fg-muted">
                  Tez
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
