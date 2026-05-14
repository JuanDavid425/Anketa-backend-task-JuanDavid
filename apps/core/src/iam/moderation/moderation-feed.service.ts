import { Injectable } from '@nestjs/common';
import { PostStatus, PostVisibility } from '@prisma/client';
import { DbService } from '../../libraries/db/db.service';

@Injectable()
export class ModerationFeedService {
  constructor(private readonly db: DbService) {}

  listVisiblePublishedPosts() {
    return this.db.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        hiddenAt: null,
        createdByUser: { suspendedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        createdByUserId: true,
      },
      take: 100,
    });
  }

  listVisibleCommentsForPost(postId: string) {
    return this.db.comment.findMany({
      where: {
        postId,
        hiddenAt: null,
        user: { suspendedAt: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        userId: true,
        postId: true,
      },
    });
  }
}
