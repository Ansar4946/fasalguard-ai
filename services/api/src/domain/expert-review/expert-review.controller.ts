import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { ConsultationService } from './consultation.service';
import {
  AssignExpertDto,
  CreateConsultationDto,
  CreateConsultationMessageDto,
  ExpertDecisionDto,
  MoreInfoDto,
  RecommendationDto,
  ResolveCaseDto,
} from './dto/expert-review.dto';
import { ExpertReviewService } from './expert-review.service';
const reviewers = [UserRole.AgricultureExpert, UserRole.Admin, UserRole.SuperAdmin];
@ApiTags('Expert cases')
@ApiBearerAuth()
@Roles(...reviewers)
@Controller({ version: '1', path: 'expert/cases' })
export class ExpertReviewController {
  constructor(private readonly service: ExpertReviewService) {}
  @Get() list(@CurrentPrincipal() p: AuthPrincipal): Promise<unknown[]> {
    return this.service.list(p);
  }
  @Get(':id') detail(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.detail(p, id);
  }
  @Post(':id/assign') assign(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: AssignExpertDto,
  ): Promise<unknown> {
    return this.service.assign(p, id, d);
  }
  @Post(':id/confirm') confirm(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: ExpertDecisionDto,
  ): Promise<unknown> {
    return this.service.confirm(p, id, d);
  }
  @Post(':id/reject') reject(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: ExpertDecisionDto,
  ): Promise<unknown> {
    return this.service.reject(p, id, d);
  }
  @Post(':id/request-more-info') more(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: MoreInfoDto,
  ): Promise<unknown> {
    return this.service.requestMoreInfo(p, id, d);
  }
  @Post(':id/recommendation') recommend(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: RecommendationDto,
  ): Promise<unknown> {
    return this.service.recommendation(p, id, d);
  }
  @Post(':id/resolve') resolve(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: ResolveCaseDto,
  ): Promise<unknown> {
    return this.service.resolve(p, id, d);
  }
}
@ApiTags('Consultations')
@ApiBearerAuth()
@Roles(UserRole.Farmer, ...reviewers)
@Controller({ version: '1', path: 'consultations' })
export class ConsultationController {
  constructor(private readonly service: ConsultationService) {}
  @Post() create(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateConsultationDto,
  ): Promise<unknown> {
    return this.service.create(p, d);
  }
  @Get() list(@CurrentPrincipal() p: AuthPrincipal): Promise<unknown[]> {
    return this.service.list(p);
  }
  @Get(':id') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.get(p, id);
  }
  @Post(':id/messages') message(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: CreateConsultationMessageDto,
  ): Promise<unknown> {
    return this.service.message(p, id, d);
  }
}
