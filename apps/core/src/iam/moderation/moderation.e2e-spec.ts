import { expectStatus, TestUtils } from '@repo/system/test/test.utils';
import {
  TEST_ADMIN_1,
  TEST_USER_1,
  TEST_USER_2,
} from '@repo/system/test/users.fixtures';
import {
  ModerationActionType,
  ModerationSuspensionLevel,
  ReportedSubjectType,
  ReportType,
} from '@prisma/client';
import { AppModule } from '../../app.module';
import { CommentSeeds } from '../../seeds/comment.seeds';
import { PostSeeds } from '../../seeds/post.seeds';
import { AdminSeeds } from '../admin/admin.seeds';
import { UserSeeds } from '../user/user.seeds';

describe('Moderation & reports (e2e)', () => {
  const test = new TestUtils(AppModule)
    .withModuleOverrides(async () => {})
    .withDatabase([UserSeeds, AdminSeeds, PostSeeds, CommentSeeds]);

  it('rejects self-report for user subject', async () => {
    const res = await test.request(TEST_USER_1).post('/reports').send({
      subjectType: ReportedSubjectType.USER,
      subjectId: TEST_USER_1.appId,
      type: ReportType.spam,
    });
    expectStatus(res, 400);
  });

  it('hides a reported post from the public feed after suspend', async () => {
    const postSeeds = test.get(PostSeeds);

    const reportRes = await test.request(TEST_USER_2).post('/reports').send({
      subjectType: ReportedSubjectType.POST,
      subjectId: postSeeds.publishedPost.id,
      type: ReportType.spam,
      message: 'Inappropriate',
    });
    expectStatus(reportRes, 201);
    const subjectId = reportRes.body.reportedSubject.id;

    const beforeFeed = await test.request(TEST_USER_1).get('/feed/posts');
    expectStatus(beforeFeed, 200);
    const beforeIds = beforeFeed.body.map((p: { id: string }) => p.id);
    expect(beforeIds).toContain(postSeeds.publishedPost.id);

    const modRes = await test
      .request(TEST_ADMIN_1)
      .post(
        `/brainbox/reported-subjects/${subjectId}/moderation-actions`,
      )
      .send({
        type: ModerationActionType.SUSPEND_REPORTED_SUBJECT,
        suspensionLevel: ModerationSuspensionLevel.TEMPORARY_1_DAY,
        reason: 'Policy violation',
      });
    expectStatus(modRes, 201);

    const afterFeed = await test.request(TEST_USER_1).get('/feed/posts');
    expectStatus(afterFeed, 200);
    const afterIds = afterFeed.body.map((p: { id: string }) => p.id);
    expect(afterIds).not.toContain(postSeeds.publishedPost.id);
  });

  it('hides a reported comment from the comment list after suspend', async () => {
    const postSeeds = test.get(PostSeeds);
    const commentSeeds = test.get(CommentSeeds);
    const comment = commentSeeds.publishedPostComment1;

    const reportRes = await test.request(TEST_USER_2).post('/reports').send({
      subjectType: ReportedSubjectType.COMMENT,
      subjectId: comment.id,
      type: ReportType.bullyingAndHarassment,
    });
    expectStatus(reportRes, 201);
    const subjectId = reportRes.body.reportedSubject.id;

    const beforeComments = await test
      .request(TEST_USER_1)
      .get(`/feed/posts/${postSeeds.publishedPost.id}/comments`);
    expectStatus(beforeComments, 200);
    expect(
      beforeComments.body.map((c: { id: string }) => c.id),
    ).toContain(comment.id);

    const modRes = await test
      .request(TEST_ADMIN_1)
      .post(
        `/brainbox/reported-subjects/${subjectId}/moderation-actions`,
      )
      .send({
        type: ModerationActionType.SUSPEND_REPORTED_SUBJECT,
        suspensionLevel: ModerationSuspensionLevel.PERMANENT,
        reason: 'Harassment',
      });
    expectStatus(modRes, 201);

    const afterComments = await test
      .request(TEST_USER_1)
      .get(`/feed/posts/${postSeeds.publishedPost.id}/comments`);
    expectStatus(afterComments, 200);
    expect(
      afterComments.body.map((c: { id: string }) => c.id),
    ).not.toContain(comment.id);
  });

  it('lists reported subjects for admins', async () => {
    const postSeeds = test.get(PostSeeds);
    await test.request(TEST_USER_2).post('/reports').send({
      subjectType: ReportedSubjectType.POST,
      subjectId: postSeeds.privatePost.id,
      type: ReportType.others,
    });

    const listRes = await test
      .request(TEST_ADMIN_1)
      .get('/brainbox/reported-subjects')
      .query({ take: 50 });
    expectStatus(listRes, 200);
    expect(listRes.body.data.length).toBeGreaterThan(0);
    expect(listRes.body.meta).toMatchObject({
      total: expect.any(Number),
      skip: 0,
      take: 50,
    });
  });
});
