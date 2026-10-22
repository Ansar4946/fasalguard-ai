import { Module } from '@nestjs/common';
import { FarmFinanceController } from './farm-finance.controller';
import { FarmLedgerService } from './farm-ledger.service';
import { UssdGatewayVerifier } from './ussd-gateway-verifier';
import { UssdPinService } from './ussd-pin.service';
import { UssdService } from './ussd.service';

@Module({
  controllers: [FarmFinanceController],
  providers: [FarmLedgerService, UssdGatewayVerifier, UssdPinService, UssdService],
  exports: [FarmLedgerService],
})
export class FarmFinanceModule {}
