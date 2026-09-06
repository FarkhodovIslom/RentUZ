import { Module } from '@nestjs/common';
import { ConsoleSmsSender, SMS_SENDER } from './sms.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [], // TokenModule is @Global and provides TokenService/PasswordService/Jwt
  controllers: [AuthController],
  providers: [AuthService, { provide: SMS_SENDER, useClass: ConsoleSmsSender }],
})
export class AuthModule {}
