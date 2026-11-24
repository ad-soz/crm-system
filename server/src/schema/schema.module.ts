import { Module } from '@nestjs/common';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';
import { SchemaEditorService } from './schema-editor.service';

@Module({
  controllers: [SchemaController],
  providers: [SchemaService, SchemaEditorService],
})
export class SchemaModule {}
