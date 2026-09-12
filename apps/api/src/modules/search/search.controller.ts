import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  MapInput,
  SearchInput,
  type CityDTOT,
  type MapInputT,
  type MapResponseT,
  type PropertyCardDTOT,
  type SearchInputT,
} from '@rentuz/contracts';
import { Public } from '../../common/decorators/public.decorator.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@Controller('search')
@Public()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('properties')
  list(@Query({ schema: SearchInput }) query: SearchInputT): Promise<{
    data: PropertyCardDTOT[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.search.search(query);
  }

  @Get('map')
  map(@Query({ schema: MapInput }) query: MapInputT): Promise<MapResponseT> {
    return this.search.map(query);
  }

  @Get('cities')
  cities(): Promise<CityDTOT[]> {
    return this.search.cities();
  }

  @Get('featured')
  featured(): Promise<PropertyCardDTOT[]> {
    return this.search.featured();
  }
}
