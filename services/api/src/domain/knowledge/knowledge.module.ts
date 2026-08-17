import { Module } from '@nestjs/common';
import { ActionPlanService } from './action-plan.service';
import { ActionPlanController, KnowledgeController } from './knowledge.controller';
import { KnowledgeAdminService } from './knowledge-admin.service';
@Module({
  controllers: [KnowledgeController, ActionPlanController],
  providers: [KnowledgeAdminService, ActionPlanService],
})
export class KnowledgeModule {}
