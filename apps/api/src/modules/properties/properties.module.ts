import { Module } from '@nestjs/common';
import { FxService } from '../fx/fx.service.js';
import { ImagesModule } from '../../common/services/images.module.js';
import { GeoRepository } from './geo.repository.js';
import { PropertiesController } from './properties.controller.js';
import { PropertyImagesController } from './property-images.controller.js';
import { PublicPropertiesController } from './public-properties.controller.js';
import { PropertiesService } from './properties.service.js';
import { SlugService } from './slug.service.js';
import { PropertyStatusService } from './status.service.js';

@Module({
  imports: [ImagesModule], // provides ImageService + StorageService
  controllers: [PropertiesController, PropertyImagesController, PublicPropertiesController],
  providers: [
    PropertiesService,
    PropertyStatusService,
    SlugService,
    GeoRepository,
    FxService,
  ],
  exports: [PropertiesService, FxService, GeoRepository],
})
export class PropertiesModule {}
