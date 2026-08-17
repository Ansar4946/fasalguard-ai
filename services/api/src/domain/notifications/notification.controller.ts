import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { CreateTaskDto, RegisterPushTokenDto, UpdateTaskDto } from './dto/notification.dto';
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
  @Get('notifications') listNotifications(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.notifications(p.userId);
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
