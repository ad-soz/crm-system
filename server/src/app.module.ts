import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { PeopleModule } from './people/people.module';
import { DealsModule } from './deals/deals.module';
import { ContactsModule } from './contacts/contacts.module';
import { TasksModule } from './tasks/tasks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { ImportExportModule } from './import-export/import-export.module';
import { SchemaModule } from './schema/schema.module';
import { AppearanceModule } from './appearance/appearance.module';
import { RoleProfilesModule } from './role-profiles/role-profiles.module';
import { ReferenceDataModule } from './reference-data/reference-data.module';
import { BackupsModule } from './backups/backups.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { AnalyseModule } from './analyse/analyse.module';
import { crmEnvFile } from './config/local-paths';

@Module({
  imports: [
    // Secrets come from the private CRM folder first (not synced by OneDrive),
    // then server/.env for non-secret settings such as DATABASE_URL.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [crmEnvFile(), '.env'] }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    PeopleModule,
    DealsModule,
    ContactsModule,
    TasksModule,
    DashboardModule,
    SearchModule,
    ImportExportModule,
    SchemaModule,
    AppearanceModule,
    RoleProfilesModule,
    ReferenceDataModule,
    BackupsModule,
    ReportsModule,
    AnalyseModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
