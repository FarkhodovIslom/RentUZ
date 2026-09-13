/**
 * §7 skip-to-content: first Tab stop on every page; visually hidden until
 * focused. Shared by every route-group layout (public/tenant/auth/owner/admin).
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only z-50 rounded-[12px] bg-primary px-4 py-2 text-sm font-semibold text-black focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
    >
      Asosiy kontentga o‘tish
    </a>
  );
}
