import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../auth/guards/user.auth.guard';
import { ModerationFeedService } from './moderation-feed.service';

@ApiTags('Feed (moderation demo)')
@Controller('feed')
@UseGuards(UserAuthGuard)
@ApiBearerAuth()
export class ModerationFeedController {
  constructor(private readonly feedService: ModerationFeedService) {}

  @Get('posts')
  @ApiOperation({
    summary:
      'List published public posts excluding hidden posts and posts by suspended users',
  })
  async listPosts() {
    return this.feedService.listVisiblePublishedPosts();
  }

  @Get('posts/:postId/comments')
  @ApiOperation({
    summary:
      'List comments for a post excluding hidden comments and comments by suspended users',
  })
  async listComments(@Param('postId', ParseUUIDPipe) postId: string) {
    return this.feedService.listVisibleCommentsForPost(postId);
  }
}
