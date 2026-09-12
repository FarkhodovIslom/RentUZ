import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

/** §60 verification queue (admin-only surface). */
@Module({
  imports: [SearchModule], // cache bump on APPROVE/REJECT (public visibility)
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
