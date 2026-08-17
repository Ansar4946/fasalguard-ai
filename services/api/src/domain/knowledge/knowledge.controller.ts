import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { ActionPlanService } from './action-plan.service';
import {
  CreateArticleDto,
  CreateGuidelineDto,
  CreateSourceDto,
  ReviewGuidelineDto,
  UpdateArticleDto,
  UpdateGuidelineDto,
  UpdateSourceDto,
} from './dto/knowledge.dto';
import { KnowledgeAdminService } from './knowledge-admin.service';
const editors = [UserRole.AgricultureExpert, UserRole.Admin, UserRole.SuperAdmin];
@ApiTags('Expert-controlled knowledge')
@ApiBearerAuth()
@Roles(...editors)
@Controller({ version: '1', path: 'knowledge' })
export class KnowledgeController {
  constructor(private readonly service: KnowledgeAdminService) {}
  @Post('sources') createSource(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateSourceDto,
  ): Promise<unknown> {
    return this.service.createSource(p, d);
  }
  @Get('sources') sources(): Promise<unknown[]> {
    return this.service.listSources();
  }
  @Patch('sources/:id') updateSource(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: UpdateSourceDto,
  ): Promise<unknown> {
    return this.service.updateSource(id, d);
  }
  @Delete('sources/:id') @HttpCode(HttpStatus.NO_CONTENT) removeSource(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.service.deleteSource(id);
  }
  @Post('articles') createArticle(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateArticleDto,
  ): Promise<unknown> {
    return this.service.createArticle(p, d);
  }
  @Get('articles') articles(): Promise<unknown[]> {
    return this.service.listArticles();
  }
  @Patch('articles/:id') updateArticle(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: UpdateArticleDto,
  ): Promise<unknown> {
    return this.service.updateArticle(id, d);
  }
  @Delete('articles/:id') @HttpCode(HttpStatus.NO_CONTENT) removeArticle(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.service.deleteArticle(id);
  }
  @Post('guidelines') createGuideline(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateGuidelineDto,
  ): Promise<unknown> {
    return this.service.createGuideline(p, d);
  }
  @Get('guidelines') guidelines(): Promise<unknown[]> {
    return this.service.listGuidelines();
  }
  @Get('guidelines/:id') guideline(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.getGuideline(id);
  }
  @Patch('guidelines/:id') updateGuideline(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: UpdateGuidelineDto,
  ): Promise<unknown> {
    return this.service.updateGuideline(id, d);
  }
  @Delete('guidelines/:id') @HttpCode(HttpStatus.NO_CONTENT) removeGuideline(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.service.removeGuideline(id);
  }
  @Post('guidelines/:id/review') review(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: ReviewGuidelineDto,
  ): Promise<unknown> {
    return this.service.review(p, id, d);
  }
  @Get('guidelines/:id/approvals') approvals(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown[]> {
    return this.service.approvals(id);
  }
}
@ApiTags('Farmer action plans')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1' })
export class ActionPlanController {
  constructor(private readonly service: ActionPlanService) {}
  @Post('crop-scans/:id/action-plan') generate(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.generate(p.userId, id);
  }
  @Get('action-plans/:id') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.get(p.userId, id);
  }
}
