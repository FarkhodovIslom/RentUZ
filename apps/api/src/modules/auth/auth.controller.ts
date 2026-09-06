import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  type LoginInputT,
  type RegisterInputT,
  type ResetPasswordInputT,
  type VerifyPhoneInputT,
  VerifyPhoneInput,
} from '@rentuz/contracts';
import { Public } from '../../common/decorators/public.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../../common/utils/cookies.js';
import { AuthService, type AuthResult } from './auth.service.js';

function requestMeta(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ key: 'register', points: 5, duration: 3600 })
  @Post('register')
  async register(
    @Body({ schema: RegisterInput }) body: RegisterInputT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(body, requestMeta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Public()
  @Throttle({ key: 'login', points: 5, duration: 60 })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body({ schema: LoginInput }) body: LoginInputT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, requestMeta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResult> {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      clearAuthCookies(res);
      throw new UnauthorizedException();
    }
    try {
      const result = await this.auth.refresh(raw, requestMeta(req));
      setAuthCookies(res, result.accessToken, result.refreshToken);
      return result;
    } catch {
      clearAuthCookies(res);
      throw new UnauthorizedException();
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(raw);
    clearAuthCookies(res);
    return { loggedOut: true };
  }

  @Public()
  @Throttle({ key: 'otp-verify', points: 5, duration: 900 })
  @HttpCode(200)
  @Post('verify-phone')
  async verifyPhone(
    @Body({ schema: VerifyPhoneInput }) body: VerifyPhoneInputT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyPhone(body, requestMeta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Public()
  @Throttle({ key: 'otp-send', points: 3, duration: 900 })
  @HttpCode(200)
  @Post('phone/resend')
  async resendOtp(@Body({ schema: ForgotPasswordInput }) body: { phone: string }) {
    return this.auth.resendOtp(body.phone, 'REGISTRATION');
  }

  @Public()
  @Throttle({ key: 'forgot-password', points: 3, duration: 3600 })
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body({ schema: ForgotPasswordInput }) body: { phone: string }) {
    // Always 200 — no user enumeration.
    return this.auth.forgotPassword(body.phone);
  }

  @Public()
  @Throttle({ key: 'reset-password', points: 3, duration: 3600 })
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(
    @Body({ schema: ResetPasswordInput }) body: ResetPasswordInputT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.resetPassword(body, requestMeta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }
}
