import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { schedulerEnabled, workersEnabled } from '../../infrastructure/execution-role';
import { MarketController } from './market.controller';
import { MarketProcessor } from './market.processor';
import { MARKET_QUEUE, MarketScheduler } from './market.scheduler';
import { MarketService } from './market.service';
import { AmisMarketPriceProvider } from './providers/amis-market-price.provider';
import { MARKET_PRICE_PROVIDER } from './providers/market-price.provider';

@Module({
  imports: [ScheduleModule.forRoot(), BullModule.registerQueue({ name: MARKET_QUEUE })],
  controllers: [MarketController],
  providers: [
    MarketService,
    AmisMarketPriceProvider,
    { provide: MARKET_PRICE_PROVIDER, useExisting: AmisMarketPriceProvider },
    ...(schedulerEnabled() ? [MarketScheduler] : []),
    ...(workersEnabled() ? [MarketProcessor] : []),
  ],
  exports: [MarketService],
})
export class MarketModule {}
