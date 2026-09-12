import { Module } from '@nestjs/common';
import { FxService } from '../fx/fx.service.js';
import { ImagesModule } from '../../common/services/images.module.js';
import { SearchModule } from '../search/search.module.js';
import { GeoRepository } from './geo.repository.js';
import { PropertiesController } from './properties.controller.js';
import { PropertyImagesController } from './property-images.controller.js';
import { PublicPropertiesController } from './public-properties.controller.js';
import { PublicPropertiesService } from './public-properties.service.js';
import { PropertiesService } from './properties.service.js';
import { SlugService } from './slug.service.js';
import { PropertyStatusService } from './status.service.js';
import { PropertyViewsService } from './views.service.js';

@Module({
  imports: [ImagesModule, SearchModule], // SearchModule → SearchCacheService (version bump)
  controllers: [PropertiesController, PropertyImagesController, PublicPropertiesController],
  providers: [
    PropertiesService,
    PropertyStatusService,
    SlugService,
    GeoRepository,
    FxService,
    PublicPropertiesService,
    PropertyViewsService,
  ],
  exports: [PropertiesService, FxService, GeoRepository, PropertyViewsService],
})
export class PropertiesModule {}
