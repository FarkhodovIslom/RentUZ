import { Global, Module } from '@nestjs/common';
import { ImageService } from './image.service.js';
import { StorageModule } from './storage.service.js';

/** Image + storage pipeline is shared by properties (Phase 2) and chat (Phase 5). */
@Global()
@Module({
  imports: [StorageModule],
  providers: [ImageService],
  exports: [ImageService, StorageModule],
})
export class ImagesModule {}
