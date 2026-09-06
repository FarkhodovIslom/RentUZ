import { Body, Controller, Get, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateMeInput, type UpdateMeInputT, type UserDTOT } from '@rentuz/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';

const SAFE_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatar: true,
  role: true,
  status: true,
  isPhoneVerified: true,
  canListProperties: true,
  createdAt: true,
} as const;

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserDTOT> {
    const me = await this.prisma.users.findUnique({ where: { id: user.id }, select: SAFE_SELECT });
    if (!me) throw new UnauthorizedException();
    return me;
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body({ schema: UpdateMeInput }) body: UpdateMeInputT,
  ): Promise<UserDTOT> {
    return this.prisma.users.update({
      where: { id: user.id },
      data: { name: body.name, email: body.email },
      select: SAFE_SELECT,
    });
  }
}
