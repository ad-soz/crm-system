import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListConfig, LISTS, listByKey } from './reference-data.config';
import { MULTI_FIELDS, classifyDbError } from './guards';
import { CreateReferenceValueDto, UpdateReferenceValueDto } from './dto/reference-value.dto';

// Columns to read/write per list. Required lists carry defaults and extras.
const EXTRA_COLUMNS: Record<string, string[]> = {
  industry: [],
  dealStage: ['isDefault', 'outcome', 'winChance'],
  contactType: ['isDefault', 'icon'],
  taskStatus: ['isDefault', 'isDone'],
  taskPriority: ['isDefault'],
};

@Injectable()
export class ReferenceDataService {
  constructor(private prisma: PrismaService) {}

  private model(list: ListConfig) {
    return (this.prisma as any)[list.model];
  }

  private requireList(key: string): ListConfig {
    const list = listByKey(key);
    if (!list) throw new NotFoundException('Unknown reference list');
    return list;
  }

  /** Turn a database-rule failure into a plain message; rethrow anything else. */
  private async guarded<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err: any) {
      const classified = classifyDbError(err);
      if (classified?.kind === 'guard') throw new BadRequestException(classified.message);
      if (classified?.kind === 'foreignKey') {
        throw new BadRequestException('That value is in use and cannot be removed. Retire it instead.');
      }
      if (classified?.kind === 'unique') {
        throw new BadRequestException('A value with that name already exists in this list.');
      }
      throw err;
    }
  }

  private fields(list: ListConfig) {
    return { base: ['id', 'name', 'colour', 'sortOrder', 'isActive'], extra: EXTRA_COLUMNS[list.model] };
  }

  async catalog() {
    const settings = await this.prisma.referenceFieldSetting.findMany();
    const multiMap = new Map(settings.map((s) => [s.fieldKey, s.allowMultiple]));
    return {
      lists: LISTS.map((l) => ({
        key: l.key,
        label: l.label,
        noun: l.noun,
        required: l.required,
        extra: l.extra,
        multiField: l.multiField ?? null,
        allowMultiple: l.multiField ? (multiMap.get(l.multiField) ?? false) : null,
      })),
    };
  }

  async list(key: string) {
    const list = this.requireList(key);
    const values = await this.model(list).findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const inUse = await this.usageCounts(list);
    return {
      key: list.key,
      values: values.map((v: any) => ({ ...v, inUse: (inUse.get(v.id) ?? 0) > 0, usageCount: inUse.get(v.id) ?? 0 })),
    };
  }

  private async usageCounts(list: ListConfig): Promise<Map<string, number>> {
    // How many records reference each value, so the UI can explain why a value
    // can only be retired (not deleted).
    const map = new Map<string, number>();
    if (list.model === 'industry') {
      const rows = await this.prisma.companyIndustry.groupBy({ by: ['industryId'], _count: { _all: true } });
      rows.forEach((r) => map.set(r.industryId, r._count._all));
      return map;
    }
    const consumer: Record<string, { table: any; column: string }> = {
      dealStage: { table: this.prisma.deal, column: 'stageId' },
      contactType: { table: this.prisma.contact, column: 'typeId' },
      taskStatus: { table: this.prisma.task, column: 'statusId' },
      taskPriority: { table: this.prisma.task, column: 'priorityId' },
    };
    const c = consumer[list.model];
    const rows = await c.table.groupBy({ by: [c.column], _count: { _all: true } });
    rows.forEach((r: any) => map.set(r[c.column], r._count._all));
    return map;
  }

  private allowedData(list: ListConfig, dto: CreateReferenceValueDto | UpdateReferenceValueDto) {
    const { extra } = this.fields(list);
    const data: Record<string, unknown> = {};
    for (const key of ['name', 'colour', 'isActive'] as const) {
      if (dto[key] !== undefined) data[key] = key === 'name' ? dto[key]!.trim() : dto[key];
    }
    for (const col of extra) if ((dto as any)[col] !== undefined) data[col] = (dto as any)[col];
    return data;
  }

  async create(key: string, dto: CreateReferenceValueDto) {
    const list = this.requireList(key);
    const max = await this.model(list).aggregate({ _max: { sortOrder: true } });
    const data = this.allowedData(list, dto);
    this.applyOutcomeChance(list, data, undefined);
    data.sortOrder = (max._max.sortOrder ?? -1) + 1;
    return this.guarded(() => this.model(list).create({ data }));
  }

  async update(key: string, id: string, dto: UpdateReferenceValueDto) {
    const list = this.requireList(key);
    const existing = await this.ensureValue(list, id);
    const data = this.allowedData(list, dto);
    this.applyOutcomeChance(list, data, existing);
    // Setting one value as the default clears the old one first, so the
    // "one default" index is never momentarily violated.
    if (dto.isDefault === true && EXTRA_COLUMNS[list.model].includes('isDefault')) {
      await this.model(list).updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
    }
    return this.guarded(() => this.model(list).update({ where: { id }, data }));
  }

  /**
   * A stage that ends as Won is a certain win (100%) and one that ends as Lost
   * is a certain loss (0%), whatever was typed, so the forecast and the data
   * can never disagree. Open stages keep the chance they were given.
   */
  private applyOutcomeChance(list: ListConfig, data: Record<string, unknown>, existing: any) {
    if (list.model !== 'dealStage') return;
    const outcome = (data.outcome as string | undefined) ?? existing?.outcome ?? 'OPEN';
    if (outcome === 'WON') data.winChance = 100;
    else if (outcome === 'LOST') data.winChance = 0;
  }

  async remove(key: string, id: string) {
    const list = this.requireList(key);
    await this.ensureValue(list, id);
    await this.guarded(() => this.model(list).delete({ where: { id } }));
    return { success: true };
  }

  async reorder(key: string, ids: string[]) {
    const list = this.requireList(key);
    const all = await this.model(list).findMany({ select: { id: true } });
    const known = new Set(all.map((v: any) => v.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw new BadRequestException('The reorder list must include every value exactly once');
    }
    await this.prisma.$transaction(ids.map((id, i) => this.model(list).update({ where: { id }, data: { sortOrder: i } })));
    return this.list(key);
  }

  async setMultiple(key: string, allowMultiple: boolean) {
    const list = this.requireList(key);
    if (!list.multiField) throw new BadRequestException('This list does not support multiple selection');
    await this.guarded(() =>
      this.prisma.referenceFieldSetting.upsert({
        where: { fieldKey: list.multiField! },
        create: { fieldKey: list.multiField!, allowMultiple },
        update: { allowMultiple },
      }),
    );
    return { fieldKey: list.multiField, allowMultiple };
  }

  private async ensureValue(list: ListConfig, id: string) {
    const found = await this.model(list).findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Value not found in this list');
    return found;
  }

  // ---- Helpers used by other services when creating records ----

  async defaultId(model: ListConfig['model']): Promise<string> {
    const list = LISTS.find((l) => l.model === model)!;
    const value = await this.model(list).findFirst({ where: { isDefault: true } });
    if (!value) throw new BadRequestException(`No default ${list.noun} is set`);
    return value.id;
  }

  async isMultiple(fieldKey: string): Promise<boolean> {
    const setting = await this.prisma.referenceFieldSetting.findUnique({ where: { fieldKey } });
    return setting?.allowMultiple ?? false;
  }

  get multiFields() {
    return MULTI_FIELDS;
  }
}
