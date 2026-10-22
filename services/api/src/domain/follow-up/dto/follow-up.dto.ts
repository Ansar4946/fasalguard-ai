import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FARMER_OBSERVATION_KEYS } from '../question-library';
class AnswerItemDto {
  @ApiProperty() @IsUUID('4') questionId!: string;
  @ApiProperty() @IsString() @MaxLength(2000) answer!: string;
}
export class SubmitAnswersDto {
  @ApiProperty({ type: [AnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers!: AnswerItemDto[];
}
export class ExplainDto {
  @ApiProperty({ default: 'English' }) @IsString() @MaxLength(40) language!: string;
}
class ObservationItemDto {
  @ApiProperty({ enum: FARMER_OBSERVATION_KEYS }) @IsIn(FARMER_OBSERVATION_KEYS) key!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) answer!: string;
}
/** Farmer-reported field observations captured during the scan, before any LLM involvement. */
export class SubmitObservationsDto {
  @ApiProperty({ type: [ObservationItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ObservationItemDto)
  observations!: ObservationItemDto[];
}
