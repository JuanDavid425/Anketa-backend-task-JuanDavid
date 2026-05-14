import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Report,
  ReportedSubject,
  ReportedSubjectModerationStatus,
  ReportedSubjectType,
  ReportType,
} from '@prisma/client';
import { DbService } from '../../libraries/db/db.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportService {
  constructor(private readonly db: DbService) {}

  async createUserReport(
    reporterUserId: string,
    dto: CreateReportDto,
  ): Promise<{ report: Report; reportedSubject: ReportedSubject }> {
    if (dto.subjectType === ReportedSubjectType.USER) {
      if (dto.subjectId === reporterUserId) {
        throw new BadRequestException('You cannot report yourself');
      }
    }
    return this.createReportInternal({
      dto,
      reporterUserId,
      reporterAdminId: undefined,
    });
  }

  async createAdminReport(
    reporterAdminId: string,
    dto: CreateReportDto,
  ): Promise<{ report: Report; reportedSubject: ReportedSubject }> {
    return this.createReportInternal({
      dto,
      reporterUserId: undefined,
      reporterAdminId,
    });
  }

  private async createReportInternal(params: {
    dto: CreateReportDto;
    reporterUserId?: string;
    reporterAdminId?: string;
  }): Promise<{ report: Report; reportedSubject: ReportedSubject }> {
    const { dto, reporterUserId, reporterAdminId } = params;
    if (
      (reporterUserId && reporterAdminId) ||
      (!reporterUserId && !reporterAdminId)
    ) {
      throw new BadRequestException('Invalid reporter');
    }

    await this.assertSubjectExists(dto.subjectType, dto.subjectId);

    const reportedSubject = await this.findOrCreateReportedSubject(
      dto.subjectType,
      dto.subjectId,
    );

    return this.db.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          type: dto.type,
          message: dto.message,
          reportedSubjectId: reportedSubject.id,
          userId: reporterUserId,
          adminId: reporterAdminId,
        },
      });

      await tx.reportedSubject.update({
        where: { id: reportedSubject.id },
        data: { reportsCount: { increment: 1 } },
      });

      return { report, reportedSubject };
    });
  }

  private subjectWhere(
    subjectType: ReportedSubjectType,
    subjectId: string,
  ): Prisma.ReportedSubjectWhereInput {
    switch (subjectType) {
      case ReportedSubjectType.USER:
        return { type: ReportedSubjectType.USER, userId: subjectId };
      case ReportedSubjectType.POST:
        return { type: ReportedSubjectType.POST, postId: subjectId };
      case ReportedSubjectType.COMMENT:
        return { type: ReportedSubjectType.COMMENT, commentId: subjectId };
      default:
        throw new BadRequestException('Invalid subject type');
    }
  }

  private async findOrCreateReportedSubject(
    subjectType: ReportedSubjectType,
    subjectId: string,
  ): Promise<ReportedSubject> {
    const where = this.subjectWhere(subjectType, subjectId);
    const existing = await this.db.reportedSubject.findFirst({ where });
    if (existing) {
      return existing;
    }

    const data: Prisma.ReportedSubjectCreateInput = {
      type: subjectType,
      moderationStatus: ReportedSubjectModerationStatus.PENDING_REVIEW,
      reportsCount: 0,
    };
    if (subjectType === ReportedSubjectType.USER) {
      data.user = { connect: { id: subjectId } };
    } else if (subjectType === ReportedSubjectType.POST) {
      data.post = { connect: { id: subjectId } };
    } else {
      data.comment = { connect: { id: subjectId } };
    }

    return this.db.reportedSubject.create({ data });
  }

  private async assertSubjectExists(
    subjectType: ReportedSubjectType,
    subjectId: string,
  ): Promise<void> {
    if (subjectType === ReportedSubjectType.USER) {
      const u = await this.db.user.findUnique({ where: { id: subjectId } });
      if (!u) throw new NotFoundException('User not found');
      return;
    }
    if (subjectType === ReportedSubjectType.POST) {
      const p = await this.db.post.findUnique({ where: { id: subjectId } });
      if (!p) throw new NotFoundException('Post not found');
      return;
    }
    const c = await this.db.comment.findUnique({ where: { id: subjectId } });
    if (!c) throw new NotFoundException('Comment not found');
  }

  async listReportsForSubject(reportedSubjectId: string): Promise<Report[]> {
    return this.db.report.findMany({
      where: { reportedSubjectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
