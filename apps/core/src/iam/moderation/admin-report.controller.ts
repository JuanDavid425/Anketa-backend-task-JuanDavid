import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin/admin.auth.guard';
import { AuthRequest } from '../auth/auth.request';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportService } from './report.service';

@ApiTags('Admin - Reports')
@Controller('brainbox/reports')
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class AdminReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @ApiOperation({ summary: 'Create a report as admin' })
  async create(@Request() req: AuthRequest, @Body() dto: CreateReportDto) {
    return this.reportService.createAdminReport(req.user.appId, dto);
  }
}
