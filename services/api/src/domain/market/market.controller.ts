import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { MarketHistoryQueryDto, MarketPricesQueryDto } from './market.dto';
import { MarketService } from './market.service';

@ApiTags('Market intelligence')
@ApiBearerAuth()
@Roles(UserRole.Farmer, UserRole.FieldWorker, UserRole.Admin, UserRole.SuperAdmin)
@Controller({ version: '1', path: 'market' })
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('prices')
  @ApiOperation({ summary: 'Latest normalized mandi prices' })
  prices(@Query() query: MarketPricesQueryDto): Promise<unknown> {
    return this.market.current(query);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historical normalized mandi prices' })
  history(@Query() query: MarketHistoryQueryDto): Promise<unknown> {
    return this.market.history(query);
  }
}
