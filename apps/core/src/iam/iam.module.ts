import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ModerationModule } from './moderation/moderation.module';
import { UserInfoModule } from './user-info/user-info.module';
import { UserSettingsModule } from './user-settings/user-settings.module';
import { UserModule } from './user/user.module';
import { AdminAuthModule } from './auth/admin/admin.auth.module';

@Module({
  imports: [
    UserModule,
    AuthModule,
    AdminModule,
    AdminAuthModule,
    UserInfoModule,
    UserSettingsModule,
    ModerationModule,
  ],
})
export class IamModule {}
