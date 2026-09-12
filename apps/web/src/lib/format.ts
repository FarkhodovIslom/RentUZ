import { format } from 'date-fns';
import { tz } from '@date-fns/tz';

/**
 * §29/§34 display helpers — store UTC, display Asia/Tashkent (0_Phase.md §9).
 * uz-UZ grouping gives "3 500 000 so'm" (narrow no-break spaces normalize to
 * regular spaces in most browsers; the E2E assertions use \s-agnostic regex).
 */
const TAK = tz('Asia/Tashkent');

/**
 * "3 500 000 so'm" (6_Phase.md §1.3.13). Intl's uz-UZ grouping separator is
 * comma in current V8, so group on en-US and swap to ASCII space — stable
 * across browsers and assertable in E2E.
 */
export function formatPriceUzs(priceUzs: number): string {
  const rounded = Math.round(priceUzs);
  return `${rounded.toLocaleString('en-US').replace(/,/g, ' ')} so'm`;
}

/** "12.09.2026, 14:35" in Tashkent time. */
export function formatDateTimeTak(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd.MM.yyyy, HH:mm', { in: TAK });
}

/** "12 sentyabr" in Tashkent time — chart/section labels (uz month names via Intl). */
export function formatDayTak(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

/** Today's calendar day in Tashkent, e.g. "12 sentyabr, 14:35" for the dashboard header. */
export function nowTak(): Date {
  // Date objects are instants; formatting applies the zone. Kept as a helper
  // so callers never hand-roll `new Date()` formatting in TZ math.
  return new Date();
}

export { format, TAK };