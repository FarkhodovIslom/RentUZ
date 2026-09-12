import { Module } from '@nestjs/common';
import { SearchCacheService } from './search-cache.service.js';
import { SearchController } from './search.controller.js';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';

// PrismaModule + RedisModule are @Global — no imports needed here.
@Module({
  controllers: [SearchController],
  providers: [SearchRepository, SearchService, SearchCacheService],
  exports: [SearchService, SearchCacheService],
})
export class SearchModule {}
