import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportType, ReportedSubjectType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ enum: ReportedSubjectType, enumName: 'ReportedSubjectType' })
  @IsEnum(ReportedSubjectType)
  subjectType: ReportedSubjectType;

  @ApiProperty({ description: 'ID of the user, post, or comment being reported' })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ enum: ReportType, enumName: 'ReportType' })
  @IsEnum(ReportType)
  type: ReportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
