import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaymentProvider, PlanCode } from '../billing.enums';

export class CreateCheckoutSessionDto {
  @IsEnum(PlanCode) planCode!: PlanCode;
}

export class SetStripePriceDto {
  @IsString() @Length(1, 255) stripePriceId!: string;
}

export class RequestUpgradeDto {
  @IsEnum(PlanCode) planCode!: PlanCode;
  @IsEnum(PaymentProvider) provider!: PaymentProvider;
  @IsString() @Length(4, 255) providerPaymentReference!: string;
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}

export class VerifyPaymentDto {
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}

export class RejectPaymentDto {
  @IsString() @Length(1, 2000) reason!: string;
}

export class RefundPaymentDto {
  @IsString() @Length(1, 2000) reason!: string;
}

export class AssignOrganizationPlanDto {
  @IsUUID('4') organizationId!: string;
  @IsEnum(PlanCode) planCode!: PlanCode;
}
