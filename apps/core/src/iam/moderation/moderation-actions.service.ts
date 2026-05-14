import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Comment,
  ModerationActionType,
  ModerationSuspensionLevel,
  Post,
  Prisma,
  ReportedSubject,
  ReportedSubjectModerationStatus,
  ReportedSubjectType,
  User,
} from '@prisma/client';
import { DbService } from '../../libraries/db/db.service';
import { PerformModerationActionDto } from './dto/perform-moderation-action.dto';

@Injectable()
export class ModerationActionsService {
  constructor(private readonly db: DbService) {}

  async listReportedSubjects(params: {
    moderationStatus?: string;
    skip: number;
    take: number;
  }) {
    const where =
      params.moderationStatus &&
      Object.values(ReportedSubjectModerationStatus).includes(
        params.moderationStatus as ReportedSubjectModerationStatus,
      )
        ? {
            moderationStatus:
              params.moderationStatus as ReportedSubjectModerationStatus,
          }
        : {};

    const [data, total] = await Promise.all([
      this.db.reportedSubject.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: { select: { id: true, username: true, email: true } },
          post: { select: { id: true, name: true, status: true } },
          comment: { select: { id: true, content: true, postId: true } },
        },
      }),
      this.db.reportedSubject.count({ where }),
    ]);

    return { data, meta: { total, skip: params.skip, take: params.take } };
  }

  async getReportedSubject(id: string) {
    const row = await this.db.reportedSubject.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } },
        post: { select: { id: true, name: true, status: true } },
        comment: { select: { id: true, content: true, postId: true } },
        reports: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!row) throw new NotFoundException('Reported subject not found');
    return row;
  }

  async performAction(
    adminId: string,
    reportedSubjectId: string,
    dto: PerformModerationActionDto,
  ) {
    const subject = await this.db.reportedSubject.findUnique({
      where: { id: reportedSubjectId },
      include: {
        post: true,
        comment: { include: { post: true } },
        user: true,
      },
    });
    if (!subject) throw new NotFoundException('Reported subject not found');

    this.validateSuspensionPayload(dto);

    return this.db.$transaction(async (tx) => {
      let moderation = await tx.reportedSubjectModeration.findFirst({
        where: { reportedSubjectId, moderatorId: adminId },
      });
      if (!moderation) {
        moderation = await tx.reportedSubjectModeration.create({
          data: { reportedSubjectId, moderatorId: adminId },
        });
      }

      await tx.reportedSubject.update({
        where: { id: reportedSubjectId },
        data: {
          activeModerationId: moderation.id,
          moderationStatusChangedAt: new Date(),
        },
      });

      const action = await tx.moderationAction.create({
        data: {
          type: dto.type,
          reason: dto.reason,
          notes: dto.notes,
          reportedSubjectId,
          moderationId: moderation.id,
          suspensionLevel: dto.suspensionLevel,
          suspensionStartsAt: dto.suspensionStartsAt,
          suspensionEndsAt: dto.suspensionEndsAt,
        },
      });

      const nextStatus = this.resolveNextModerationStatus(subject, dto.type);
      await tx.reportedSubject.update({
        where: { id: reportedSubjectId },
        data: {
          latestModerationActionId: action.id,
          moderationStatus: nextStatus,
        },
      });

      await this.applySideEffects(tx, subject, dto);

      await tx.report.updateMany({
        where: { reportedSubjectId },
        data: { hasBeenReviewed: true },
      });

      return tx.moderationAction.findUniqueOrThrow({
        where: { id: action.id },
        include: {
          reportedSubject: true,
          moderation: true,
        },
      });
    });
  }

  private validateSuspensionPayload(dto: PerformModerationActionDto) {
    if (
      dto.type === ModerationActionType.SUSPEND_REPORTED_SUBJECT ||
      dto.type === ModerationActionType.SUSPEND_USER
    ) {
      if (!dto.suspensionLevel) {
        throw new BadRequestException(
          'suspensionLevel is required for this action',
        );
      }
      if (dto.suspensionLevel === ModerationSuspensionLevel.CUSTOM) {
        if (!dto.suspensionStartsAt || !dto.suspensionEndsAt) {
          throw new BadRequestException(
            'suspensionStartsAt and suspensionEndsAt are required for CUSTOM suspension',
          );
        }
      }
    }
  }

  private resolveNextModerationStatus(
    subject: ReportedSubject,
    action: ModerationActionType,
  ): ReportedSubjectModerationStatus {
    switch (action) {
      case ModerationActionType.ESCALATE:
        return ReportedSubjectModerationStatus.ESCALATED;
      case ModerationActionType.REOPEN:
        return ReportedSubjectModerationStatus.PENDING_REVIEW;
      case ModerationActionType.DISMISS:
      case ModerationActionType.MARK_AS_SENSITIVE:
      case ModerationActionType.MARK_AS_NOT_SENSITIVE:
      case ModerationActionType.SUSPEND_REPORTED_SUBJECT:
      case ModerationActionType.SUSPEND_USER:
      case ModerationActionType.UNSUSPEND_REPORTED_SUBJECT:
      case ModerationActionType.UNSUSPEND_USER:
        return ReportedSubjectModerationStatus.RESOLVED;
      default:
        return subject.moderationStatus;
    }
  }

  private suspensionEndsAt(
    level: ModerationSuspensionLevel | undefined,
    from: Date,
    dto: PerformModerationActionDto,
  ): Date | null {
    if (!level) return null;
    if (level === ModerationSuspensionLevel.WARNING) return null;
    if (level === ModerationSuspensionLevel.PERMANENT) return null;
    if (level === ModerationSuspensionLevel.CUSTOM) {
      return dto.suspensionEndsAt ?? null;
    }
    const d = new Date(from);
    if (level === ModerationSuspensionLevel.TEMPORARY_1_DAY) {
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (level === ModerationSuspensionLevel.TEMPORARY_2_DAYS) {
      d.setDate(d.getDate() + 2);
      return d;
    }
    if (level === ModerationSuspensionLevel.TEMPORARY_7_DAYS) {
      d.setDate(d.getDate() + 7);
      return d;
    }
    return null;
  }

  private async applySideEffects(
    tx: Prisma.TransactionClient,
    subject: ReportedSubject & {
      post: Post | null;
      comment: (Comment & { post: Post }) | null;
      user: User | null;
    },
    dto: PerformModerationActionDto,
  ) {
    const reason = dto.reason ?? dto.notes ?? undefined;
    const now = new Date();

    switch (dto.type) {
      case ModerationActionType.MARK_AS_SENSITIVE:
        if (subject.type === ReportedSubjectType.POST && subject.postId) {
          await tx.post.update({
            where: { id: subject.postId },
            data: { hasSensitiveContent: true },
          });
        }
        break;
      case ModerationActionType.MARK_AS_NOT_SENSITIVE:
        if (subject.type === ReportedSubjectType.POST && subject.postId) {
          await tx.post.update({
            where: { id: subject.postId },
            data: { hasSensitiveContent: false },
          });
        }
        break;
      case ModerationActionType.SUSPEND_REPORTED_SUBJECT:
        await this.suspendReportedSubject(tx, subject, dto, now, reason);
        break;
      case ModerationActionType.SUSPEND_USER:
        await this.suspendRelatedUser(tx, subject, dto, now, reason);
        break;
      case ModerationActionType.UNSUSPEND_REPORTED_SUBJECT:
        await this.unsuspendReportedSubject(tx, subject);
        break;
      case ModerationActionType.UNSUSPEND_USER:
        await this.unsuspendRelatedUser(tx, subject);
        break;
      default:
        break;
    }
  }

  private async suspendReportedSubject(
    tx: Prisma.TransactionClient,
    subject: ReportedSubject & {
      post: Post | null;
      comment: (Comment & { post: Post }) | null;
      user: User | null;
    },
    dto: PerformModerationActionDto,
    now: Date,
    reason?: string,
  ) {
    if (subject.type === ReportedSubjectType.POST && subject.post) {
      await tx.post.update({
        where: { id: subject.post.id },
        data: {
          hiddenAt: now,
          hiddenReason: reason,
        },
      });
      return;
    }
    if (subject.type === ReportedSubjectType.COMMENT && subject.comment) {
      await tx.comment.update({
        where: { id: subject.comment.id },
        data: {
          hiddenAt: now,
          hiddenReason: reason,
        },
      });
      return;
    }
    if (subject.type === ReportedSubjectType.USER && subject.user) {
      await this.applyUserSuspension(
        tx,
        subject.user.id,
        dto,
        now,
        reason,
      );
    }
  }

  private async suspendRelatedUser(
    tx: Prisma.TransactionClient,
    subject: ReportedSubject & {
      post: Post | null;
      comment: (Comment & { post: Post }) | null;
      user: User | null;
    },
    dto: PerformModerationActionDto,
    now: Date,
    reason?: string,
  ) {
    const userId = this.resolveRelatedUserId(subject);
    if (!userId) {
      throw new BadRequestException('No related user for this subject');
    }
    await this.applyUserSuspension(tx, userId, dto, now, reason);
  }

  private resolveRelatedUserId(
    subject: ReportedSubject & {
      post: Post | null;
      comment: (Comment & { post: Post }) | null;
      user: User | null;
    },
  ): string | null {
    if (subject.type === ReportedSubjectType.USER && subject.userId) {
      return subject.userId;
    }
    if (subject.type === ReportedSubjectType.POST && subject.post) {
      return subject.post.createdByUserId;
    }
    if (subject.type === ReportedSubjectType.COMMENT && subject.comment) {
      return subject.comment.userId;
    }
    return null;
  }

  private async applyUserSuspension(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: PerformModerationActionDto,
    now: Date,
    reason?: string,
  ) {
    const level = dto.suspensionLevel!;
    if (level === ModerationSuspensionLevel.WARNING) {
      await tx.user.update({
        where: { id: userId },
        data: {
          suspensionReason: reason ?? 'Warning',
        },
      });
      return;
    }

    const ends = this.suspensionEndsAt(level, now, dto);
    await tx.user.update({
      where: { id: userId },
      data: {
        suspendedAt: dto.suspensionStartsAt ?? now,
        suspendedUntil: ends,
        suspensionReason: reason,
      },
    });
  }

  private async unsuspendReportedSubject(
    tx: Prisma.TransactionClient,
    subject: ReportedSubject & {
      post: Post | null;
      comment: (Comment & { post: Post }) | null;
    },
  ) {
    if (subject.type === ReportedSubjectType.POST && subject.postId) {
      await tx.post.update({
        where: { id: subject.postId },
        data: { hiddenAt: null, hiddenUntil: null, hiddenReason: null },
      });
    }
    if (subject.type === ReportedSubjectType.COMMENT && subject.commentId) {
      await tx.comment.update({
        where: { id: subject.commentId },
        data: { hiddenAt: null, hiddenUntil: null, hiddenReason: null },
      });
    }
    if (subject.type === ReportedSubjectType.USER && subject.userId) {
      await tx.user.update({
        where: { id: subject.userId },
        data: {
          suspendedAt: null,
          suspendedUntil: null,
          suspensionReason: null,
        },
      });
    }
  }

  private async unsuspendRelatedUser(
    tx: Prisma.TransactionClient,
    subject: ReportedSubject & {
      post: Post | null;
      comment: (Comment & { post: Post }) | null;
    },
  ) {
    const userId = this.resolveRelatedUserId(subject);
    if (!userId) return;
    await tx.user.update({
      where: { id: userId },
      data: {
        suspendedAt: null,
        suspendedUntil: null,
        suspensionReason: null,
      },
    });
  }
}
