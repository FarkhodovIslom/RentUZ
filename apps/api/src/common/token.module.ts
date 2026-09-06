import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';

/**
 * Token/password services are consumed by global guards and the auth module —
 * keep them in a @Global module so DI resolves everywhere.
 */
@Global()
@Module({
  imports: [
    // Secret/TTL are passed per-call in TokenService; this only satisfies
    // the JwtService constructor.
    JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
  ],
  providers: [PasswordService, TokenService],
  exports: [PasswordService, TokenService, JwtModule],
})
export class TokenModule {}
