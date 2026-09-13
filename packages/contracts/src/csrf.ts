import { z } from 'zod';

/**
 * CSRF double-submit (§53 / 8_Phase.md §1.3 item 14): the API issues a
 * random token in an HttpOnly cookie AND returns it in the JSON body; the
 * browser must echo it in the `x-rentuz-csrf` header on every mutating BFF
 * call, where the BFF compares header vs cookie.
 */
export const CSRF_COOKIE = 'rentuz_csrf';
export const CSRF_HEADER = 'x-rentuz-csrf';

export const CsrfTokenDTO = z.object({
  token: z.string().min(32).max(128),
});
export type CsrfTokenDTOT = z.infer<typeof CsrfTokenDTO>;
