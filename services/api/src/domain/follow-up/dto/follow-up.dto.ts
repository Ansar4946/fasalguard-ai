import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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
