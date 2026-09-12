import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchInput, type PropertyCardDTOT, type SearchInputT } from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { FavoritesService } from './favorites.service.js';

@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: SearchInput }) query: SearchInputT,
  ): Promise<{
    data: PropertyCardDTOT[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.favorites.list(user.id, query);
  }

  @Throttle({ key: 'favorites-write', points: 60, duration: 60 })
  @Post(':propertyId')
  add(@CurrentUser() user: AuthUser, @Param('propertyId') propertyId: string) {
    return this.favorites.add(user.id, propertyId);
  }

  @Throttle({ key: 'favorites-write', points: 60, duration: 60 })
  @Delete(':propertyId')
  remove(@CurrentUser() user: AuthUser, @Param('propertyId') propertyId: string) {
    return this.favorites.remove(user.id, propertyId);
  }
}
