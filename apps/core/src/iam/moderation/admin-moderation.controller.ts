import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin/admin.auth.guard';
import { AuthRequest } from '../auth/auth.request';
import {
  ListReportedSubjectsQueryDto,
  PerformModerationActionDto,
} from './dto/perform-moderation-action.dto';
import { ModerationActionsService } from './moderation-actions.service';

@ApiTags('Admin - Moderation')
@Controller('brainbox/reported-subjects')
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class AdminModerationController {
  constructor(
    private readonly moderationActionsService: ModerationActionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reported subjects' })
  async list(@Query() query: ListReportedSubjectsQueryDto) {
    return this.moderationActionsService.listReportedSubjects({
      moderationStatus: query.moderationStatus,
      skip: query.skip ?? 0,
      take: Math.min(query.take ?? 20, 100),
    });
  }

  @Get(':subjectId')
  @ApiOperation({ summary: 'Get one reported subject with recent reports' })
  async getOne(@Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.moderationActionsService.getReportedSubject(subjectId);
  }

  @Post(':subjectId/moderation-actions')
  @ApiOperation({ summary: 'Perform a moderation action on a reported subject' })
  async moderate(
    @Request() req: AuthRequest,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: PerformModerationActionDto,
  ) {
    return this.moderationActionsService.performAction(
      req.user.appId,
      subjectId,
      dto,
    );
  }
}
