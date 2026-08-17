import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentPrincipal } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import type { AuthPrincipal, CurrentUser, SessionContext, TokenPair } from './auth.types';
@ApiTags('Authentication')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('register') register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<{ user: CurrentUser; tokens: TokenPair }> {
    return this.auth.register(dto, this.context(req));
  }
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<{ user: CurrentUser; tokens: TokenPair }> {
    return this.auth.login(dto, this.context(req));
  }
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken, this.context(req));
  }
  @HttpCode(HttpStatus.NO_CONTENT) @Post('logout') async logout(
    @CurrentPrincipal() user: AuthPrincipal,
    @Body() dto: LogoutDto,
  ): Promise<void> {
    await this.auth.logout(user.userId, dto.refreshToken);
  }
  @Get('me') me(@CurrentPrincipal() user: AuthPrincipal): Promise<CurrentUser> {
    return this.auth.me(user);
  }
  @Get('sessions') sessions(@CurrentPrincipal() user: AuthPrincipal): Promise<unknown[]> {
    return this.auth.sessions(user.userId);
  }
  @HttpCode(HttpStatus.NO_CONTENT) @Delete('sessions/:id') async revoke(
    @CurrentPrincipal() user: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    if (!(await this.auth.revokeSession(user.userId, id)))
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Session was not found.' });
  }
  @Delete('sessions') async revokeAll(
    @CurrentPrincipal() user: AuthPrincipal,
  ): Promise<{ revoked: number }> {
    return { revoked: await this.auth.revokeAllSessions(user.userId) };
  }
  private context(req: Request): SessionContext {
    return {
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent')?.slice(0, 512) ?? null,
    };
  }
}
