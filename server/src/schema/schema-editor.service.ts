import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildModelFromDmmf,
  applyOps,
  serializeSchema,
  assertSafeSchema,
  SchemaEditError,
} from './index-internal';
import { SchemaOp, PreviewResult, ApplyResult } from './schema-ops.types';

const execFileAsync = promisify(execFile);

@Injectable()
export class SchemaEditorService {
  private readonly schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');

  isEnabled(): boolean {
    return process.env.SCHEMA_EDITING_ENABLED === 'true';
  }

  private ensureEnabled() {
    if (!this.isEnabled()) {
      throw new ForbiddenException(
        'Schema editing is disabled. Set SCHEMA_EDITING_ENABLED=true to enable it (intended for local/dev use only).',
      );
    }
  }

  /** Build the proposed schema file text from the current model + operations. */
  private buildProposedSchema(ops: SchemaOp[]): string {
    try {
      const model = buildModelFromDmmf();
      const next = applyOps(model, ops);
      const text = serializeSchema(next);
      assertSafeSchema(text, next.models.map((m) => m.name));
      return text;
    } catch (err) {
      if (err instanceof SchemaEditError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * Generate a SQL preview of the change using `prisma migrate diff` between the
   * current database and the proposed schema. Nothing is written to the DB.
   */
  async preview(ops: SchemaOp[]): Promise<PreviewResult> {
    this.ensureEnabled();
    if (!ops.length) throw new BadRequestException('No operations provided');

    const proposed = this.buildProposedSchema(ops);

    // Write the proposed schema to a temp file and diff the live DB against it.
    const tmpFile = path.join(os.tmpdir(), `crm-proposed-${Date.now()}.prisma`);
    fs.writeFileSync(tmpFile, proposed, 'utf-8');

    try {
      const { stdout } = await execFileAsync(
        'npx',
        [
          'prisma',
          'migrate',
          'diff',
          '--from-schema-datasource',
          this.schemaPath,
          '--to-schema-datamodel',
          tmpFile,
          '--script',
        ],
        { cwd: process.cwd(), shell: true },
      );

      const sql = stdout.trim();
      const destructive = /\bDROP\s+(TABLE|COLUMN)\b/i.test(sql) || /DROP\s+"/i.test(sql);
      const warnings: string[] = [];
      if (destructive) {
        warnings.push('This change drops a table or column and will permanently delete data.');
      }
      if (!sql || /no difference/i.test(sql)) {
        warnings.push('No schema changes detected.');
      }
      return { sql: sql || '-- No changes', destructive, warnings };
    } catch (err: any) {
      throw new BadRequestException(`Failed to generate preview: ${err.stderr || err.message}`);
    } finally {
      fs.rmSync(tmpFile, { force: true });
    }
  }

  /**
   * Apply the change: write the new schema.prisma, run a migration, and
   * regenerate the client. On any failure, restore the previous schema file.
   */
  async apply(ops: SchemaOp[], migrationName: string): Promise<ApplyResult> {
    this.ensureEnabled();
    if (!ops.length) throw new BadRequestException('No operations provided');
    const safeName = this.sanitizeMigrationName(migrationName);

    const proposed = this.buildProposedSchema(ops);
    const backup = fs.readFileSync(this.schemaPath, 'utf-8');

    fs.writeFileSync(this.schemaPath, proposed, 'utf-8');

    // Phase 1: apply the DB migration. If this fails, nothing was committed,
    // so we can safely roll the schema file back to its previous state.
    try {
      await execFileAsync(
        'npx',
        ['prisma', 'migrate', 'dev', '--name', safeName, '--skip-generate'],
        { cwd: process.cwd(), shell: true, env: { ...process.env } },
      );
    } catch (err: any) {
      fs.writeFileSync(this.schemaPath, backup, 'utf-8');
      return { success: false, error: err.stderr || err.message };
    }

    // Phase 2: regenerate the client. The migration is already committed to the
    // database at this point, so a failure here must NOT roll back the schema
    // (that would cause drift). On Windows the engine DLL can be locked by the
    // running server; in that case we report success and ask for a restart.
    try {
      await execFileAsync('npx', ['prisma', 'generate'], { cwd: process.cwd(), shell: true });
      return { success: true, migrationName: safeName };
    } catch (err: any) {
      const locked = /EPERM|EBUSY|operation not permitted/i.test(err.stderr || err.message || '');
      return {
        success: true,
        migrationName: safeName,
        error: locked
          ? 'Migration applied. Restart the server to load the updated Prisma client.'
          : `Migration applied, but client generation reported: ${err.stderr || err.message}`,
      };
    }
  }

  private sanitizeMigrationName(name: string): string {
    const cleaned = (name || 'schema_edit')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
    return cleaned || 'schema_edit';
  }
}
