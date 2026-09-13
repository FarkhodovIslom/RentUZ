import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { CSRF_COOKIE, CsrfTokenDTO, type CsrfTokenDTOT } from '@rentuz/contracts';
import { Public } from '../../common/decorators/public.decorator.js';

/**
 * CSRF double-submit token issuer (§53 / 8_Phase.md §1.3 item 14): one GET
 * hands the browser a random token twice — HttpOnly cookie (unreadable to
 * JS, immune to attacker-set headers on cross-site forms) + JSON value the
 * app echoes in the `x-rentuz-csrf` header. The BFF compares the pair on
 * POST/PATCH/PUT/DELETE. SameSite=Lax cookies remain the first line; this is
 * belt-and-suspenders for the cross-site POST edge (top-level form posts).
 */
@ApiTags('auth')
@Controller('csrf')
@Public()
export class CsrfController {
  @Get()
  issue(@Res({ passthrough: true }) res: Response): CsrfTokenDTOT {
    const token = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Long enough to outlive a session page-load; refresh on every fetch
      // of /csrf keeps rotation cheap.
      maxAge: 24 * 60 * 60 * 1000,
    });
    return CsrfTokenDTO.parse({ token });
  }
}
