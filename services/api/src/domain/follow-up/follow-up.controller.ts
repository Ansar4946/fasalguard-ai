import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { ExplainDto, SubmitAnswersDto } from './dto/follow-up.dto';
import { FollowUpService } from './follow-up.service';
@ApiTags('Intelligent follow-up and explanations')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'crop-scans/:id' })
export class FollowUpController {
  constructor(private readonly service: FollowUpService) {}
  @Post('follow-up/questions') generate(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.generate(p.userId, id);
  }
  @Get('follow-up/questions') questions(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.questions(p.userId, id);
  }
  @Post('follow-up/answers') answers(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SubmitAnswersDto,
  ): Promise<unknown> {
    return this.service.answer(p.userId, id, dto);
  }
  @Post('explanation') explain(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ExplainDto,
  ): Promise<unknown> {
    return this.service.explain(p.userId, id, dto);
  }
}
