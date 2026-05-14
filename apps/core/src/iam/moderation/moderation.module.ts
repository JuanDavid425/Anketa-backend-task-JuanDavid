import { Module } from '@nestjs/common';
import { FirebaseModule } from '../../libraries/firebase/firebase.module';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminReportController } from './admin-report.controller';
import { ModerationActionsService } from './moderation-actions.service';
import { ModerationFeedController } from './moderation-feed.controller';
import { ModerationFeedService } from './moderation-feed.service';
import { ReportService } from './report.service';
import { UserReportController } from './user-report.controller';

@Module({
  imports: [FirebaseModule],
  controllers: [
    UserReportController,
    AdminReportController,
    AdminModerationController,
    ModerationFeedController,
  ],
  providers: [
    ReportService,
    ModerationActionsService,
    ModerationFeedService,
  ],
  exports: [ReportService, ModerationActionsService, ModerationFeedService],
})
export class ModerationModule {}
