import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import {
  CreateTaskDto,
  RegisterPushTokenDto,
  UpdatePreferenceDto,
  UpdateTaskDto,
} from './dto/notification.dto';
import { NotificationCategory } from './notification.enums';
import { NotificationService } from './notification.service';
/* Controller return values are inferred from the service contract for Swagger/runtime passthrough. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@ApiTags('Farmer tasks and notifications')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1' })
export class NotificationController {
  constructor(private readonly service: NotificationService) {}
  @Post('devices/push-token') register(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: RegisterPushTokenDto,
  ) {
    return this.service.registerToken(p.userId, d);
  }
  @Delete('devices/push-token/:id') remove(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.deleteToken(p.userId, id);
  }
  @Get('notifications') listNotifications(
    @CurrentPrincipal() p: AuthPrincipal,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    // Parsed here rather than with ParseBoolPipe: the global transforming pipe would coerce "maybe" to true.
    if (unreadOnly !== undefined && unreadOnly !== 'true' && unreadOnly !== 'false')
      throw new BadRequestException('unreadOnly must be true or false.');
    // Out-of-range values are rejected, not clamped, so clients learn about a wrong page size.
    if (
      limit !== undefined &&
      (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)
    )
      throw new BadRequestException('limit must be a whole number between 1 and 100.');
    return this.service.notifications(p.userId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit === undefined ? undefined : Number(limit),
    });
  }
  @Get('notifications/unread-count') unreadCount(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.unreadCount(p.userId);
  }
  @Post('notifications/read-all') readAll(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.readAll(p.userId);
  }
  @Get('notifications/preferences') preferences(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.preferences(p.userId);
  }
  @Put('notifications/preferences/:category') setPreference(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('category', new ParseEnumPipe(NotificationCategory)) category: NotificationCategory,
    @Body() d: UpdatePreferenceDto,
  ) {
    return this.service.setPreference(p.userId, category, d);
  }
  @Patch('notifications/:id/read') read(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.read(p.userId, id);
  }
  @Get('tasks') tasks(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.tasks(p.userId);
  }
  @Post('tasks') create(@CurrentPrincipal() p: AuthPrincipal, @Body() d: CreateTaskDto) {
    return this.service.createTask(p.userId, d);
  }
  @Patch('tasks/:id') update(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: UpdateTaskDto,
  ) {
    return this.service.updateTask(p.userId, id, d);
  }
  @Post('tasks/:id/complete') complete(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.completeTask(p.userId, id);
  }
}
