import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ModerationActionType,
  ModerationSuspensionLevel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class PerformModerationActionDto {
  @ApiProperty({ enum: ModerationActionType, enumName: 'ModerationActionType' })
  @IsEnum(ModerationActionType)
  type: ModerationActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ enum: ModerationSuspensionLevel })
  @IsOptional()
  @IsEnum(ModerationSuspensionLevel)
  suspensionLevel?: ModerationSuspensionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  suspensionStartsAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  suspensionEndsAt?: Date;
}

export class ListReportedSubjectsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  moderationStatus?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  take?: number;
}
