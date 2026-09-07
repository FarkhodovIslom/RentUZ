import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
// MulterFile is a slim local interface for the parsed multipart file. We can't
// import the runtime `multer` package (it's a peer of @nestjs/platform-express
// and would trigger a runtime import in the ESM dist), and @types/multer only
// augments the global Express namespace — neither of which TypeScript exposes
// as a clean import path here. Express.Multer.File IS the same shape (the
// @types/multer declaration is `declare global { namespace Express { namespace
// Multer { interface File { ... } } } }`), so we redeclare the same minimal
// surface inline. The single consumer (this controller) only reads `buffer`.
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { ImageService } from '../../common/services/image.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PropertiesService } from './properties.service.js';
import { StorageService } from '../../common/services/storage.service.js';

const MAX_IMAGES_PER_PROPERTY = 15;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const PUBLIC_BASE_URL = (process.env.PUBLIC_STORAGE_BASE_URL ?? 'http://localhost:9000/rentuz-public').replace(
  /\/$/,
  '',
);

@ApiTags('property-images')
@Controller('properties/:id/images')
export class PropertyImagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly images: ImageService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async list(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.properties.findOneForOwner(id, user.id);
    return this.prisma.propertyImages.findMany({
      where: { propertyId: id },
      orderBy: { ordering: 'asc' },
    });
  }

  @Post()
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES })],
      }),
    )
    file: MulterFile,
  ) {
    const property = await this.properties.findOneForOwner(id, user.id);

    const existingCount = await this.prisma.propertyImages.count({ where: { propertyId: id } });
    if (existingCount >= MAX_IMAGES_PER_PROPERTY) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Mulk uchun maksimum ${MAX_IMAGES_PER_PROPERTY} ta rasm mumkin`,
      });
    }

    const processed = await this.images.processAndStore(file.buffer, {
      keyPrefix: `properties/${id}`,
      minWidth: 640,
      minHeight: 480,
    });

    const lastOrder = await this.prisma.propertyImages.aggregate({
      where: { propertyId: id },
      _max: { ordering: true },
    });
    const ordering = (lastOrder._max.ordering ?? -1) + 1;

    const imageId = randomBytes(8).toString('hex');
    const created = await this.prisma.propertyImages.create({
      data: {
        id: imageId,
        propertyId: id,
        url: processed.variants['1600'].key,
        thumbUrl: processed.variants['400'].key,
        width: processed.width,
        height: processed.height,
        ordering,
      },
    });

    if (!property.mainImageUrl && ordering === 0) {
      const url = `${PUBLIC_BASE_URL}/${created.thumbUrl ?? created.url}`;
      await this.prisma.properties.update({
        where: { id },
        data: { mainImageUrl: url },
      });
    }

    return {
      ...created,
      url: `${PUBLIC_BASE_URL}/${created.url}`,
      thumbUrl: created.thumbUrl ? `${PUBLIC_BASE_URL}/${created.thumbUrl}` : null,
      variants: Object.fromEntries(
        Object.entries(processed.variants).map(([k, v]) => [k, `${PUBLIC_BASE_URL}/${v.key}`]),
      ),
    };
  }

  @Delete(':imageId')
  async remove(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.properties.findOneForOwner(id, user.id);
    const image = await this.prisma.propertyImages.findUnique({ where: { id: imageId } });
    if (!image || image.propertyId !== id) {
      throw new BadRequestException({ code: 'IMAGE_NOT_FOUND' });
    }
    await this.prisma.propertyImages.delete({ where: { id: imageId } });
    // Best-effort storage delete; orphan job will reconcile if it fails.
    await Promise.all([this.storage.delete(image.url), image.thumbUrl && this.storage.delete(image.thumbUrl)].filter(Boolean) as Promise<void>[]);
    return { removed: true };
  }
}
