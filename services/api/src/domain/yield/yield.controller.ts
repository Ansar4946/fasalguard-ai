import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { YieldReferenceQueryDto } from './yield.dto';
import { YieldService } from './yield.service';

@ApiTags('Yield reference')
@ApiBearerAuth()
@Roles(UserRole.Farmer, UserRole.FieldWorker, UserRole.Admin, UserRole.SuperAdmin)
@Controller({ version: '1', path: 'yield' })
export class YieldController {
  constructor(private readonly yields: YieldService) {}

  @Get('reference')
  @ApiOperation({
    summary:
      'Historical yield reference ranges (no prediction; predictionAvailable is always false)',
  })
  reference(@Query() q: YieldReferenceQueryDto): ReturnType<YieldService['reference']> {
    return this.yields.reference(q.crop, q.district);
  }
}
