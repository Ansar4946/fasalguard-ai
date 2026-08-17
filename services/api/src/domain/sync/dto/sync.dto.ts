import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsObject, IsUUID, ValidateNested } from 'class-validator';
import { SyncMutationType } from '../sync.enums';
export class SyncMutationDto {
  @IsUUID('4') clientMutationId!: string;
  @IsUUID('4') deviceId!: string;
  @IsEnum(SyncMutationType) type!: SyncMutationType;
  @IsObject() payload!: Record<string, unknown>;
}
export class SyncMutationsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations!: SyncMutationDto[];
}
export class SyncChangesQueryDto {
  @IsUUID('4') deviceId!: string;
}
