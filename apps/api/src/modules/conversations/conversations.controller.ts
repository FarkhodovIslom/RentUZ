import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  ConversationListQuery,
  type ConversationListQueryT,
  CreateConversationInput,
  type CreateConversationInputT,
  MessageListQuery,
  type MessageListQueryT,
  SendMessageInput,
  type SendMessageInputT,
} from '@rentuz/contracts';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '../../common/decorators/throttle.decorator.js';
import { ImageService } from '../../common/services/image.service.js';
import { StorageService } from '../../common/services/storage.service.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';

// Same slim local shape as property-images.controller (runtime `multer` import
// is unavailable in the ESM dist; only `buffer` is consumed).
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_FILES_PER_MESSAGE = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * §45 chat REST API — conversations, messages, read receipts, and private
 * attachments. Realtime delivery rides the same services (one emit path).
 */
@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly images: ImageService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: ConversationListQuery }) query: ConversationListQueryT,
  ) {
    return this.conversationsService.listForUser(user.id, query);
  }

  @Throttle({ key: 'conversations-create', points: 30, duration: 60 })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateConversationInput }) body: CreateConversationInputT,
  ) {
    return this.conversationsService.getOrCreate(user.id, body);
  }

  @Get(':id/messages')
  listMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query({ schema: MessageListQuery }) query: MessageListQueryT,
  ) {
    return this.messagesService.list(id, user.id, query);
  }

  /** §98: 30 messages/min per user. */
  @Throttle({ key: 'messages-send', points: 30, duration: 60 })
  @Post(':id/messages')
  @HttpCode(201)
  send(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body({ schema: SendMessageInput }) body: SendMessageInputT,
  ) {
    return this.messagesService.send(id, user.id, body);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversationsService.read(id, user.id);
  }

  /**
   * §94 upload — ≤5 files, ≤10 MB each, JPEG/PNG/WebP (magic bytes). Stored
   * in the PRIVATE bucket under `chat/{conversationId}/{attachmentId}/800.webp`;
   * URLs are never returned here (signed on demand below).
   */
  @Throttle({ key: 'chat-attachments', points: 30, duration: 60 })
  @Post(':id/attachments')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_MESSAGE))
  async uploadAttachments(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE_BYTES })],
      }),
    )
    files: MulterFile[],
  ) {
    await this.conversationsService.requireParticipant(id, user.id);
    if (!files || files.length === 0) {
      return [];
    }
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const processed = await this.images.processAndStore(file.buffer, {
          keyPrefix: `chat/${id}`,
          minWidth: 100,
          minHeight: 100,
          variantWidths: [800],
          bucket: 'private',
        });
        const variant = processed.variants['800']!;
        return {
          key: variant.key,
          mime: 'image/webp',
          width: processed.width,
          height: processed.height,
          size: variant.buffer.byteLength,
        };
      }),
    );
    return uploaded;
  }

  /** Mint a 600 s signed URL for a private-bucket attachment key (§94). */
  @Get(':id/attachments/url')
  async signedAttachmentUrl(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('key') key: string,
  ) {
    await this.conversationsService.requireParticipant(id, user.id);
    if (!key.startsWith(`chat/${id}/`)) {
      throw new ForbiddenException({ code: 'INVALID_ATTACHMENT_KEY' });
    }
    const url = await this.storage.signedUrl(key, SIGNED_URL_TTL_SECONDS);
    return { url, expiresIn: SIGNED_URL_TTL_SECONDS };
  }
}
