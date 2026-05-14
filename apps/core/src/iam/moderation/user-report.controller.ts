import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../auth/guards/user.auth.guard';
import { AuthRequest } from '../auth/auth.request';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportService } from './report.service';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(UserAuthGuard)
@ApiBearerAuth()
export class UserReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @ApiOperation({ summary: 'Report a user, post, or comment' })
  async create(@Request() req: AuthRequest, @Body() dto: CreateReportDto) {
    return this.reportService.createUserReport(req.user.appId, dto);
  }
}
