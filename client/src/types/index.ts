// ---- Reference data (UI-managed lists) ----
// Badge colours map to the theme tokens; the Badge component understands these.
export type ReferenceColour = 'secondary' | 'default' | 'info' | 'success' | 'warning' | 'destructive';

export const REFERENCE_COLOURS: ReferenceColour[] = ['secondary', 'default', 'info', 'success', 'warning', 'destructive'];
export const CONTACT_ICONS = ['mail', 'phone', 'users', 'file-text', 'calendar', 'message-circle', 'video', 'check'] as const;
export type ContactIconName = (typeof CONTACT_ICONS)[number];

export type StageOutcome = 'OPEN' | 'WON' | 'LOST';

/** One value in a reference list, as returned by the API. */
export interface ReferenceValue {
  id: string;
  name: string;
  colour: ReferenceColour;
  sortOrder: number;
  isActive: boolean;
  isDefault?: boolean;
  /** Deal stages carry an outcome used for "open" vs closed. */
  outcome?: StageOutcome;
  /** Deal stages carry a win chance (0 to 100) used for the weighted forecast. */
  winChance?: number;
  /** Task statuses carry a "counts as done" flag. */
  isDone?: boolean;
  /** Contact types carry an icon name. */
  icon?: ContactIconName | null;
  /** Present on list responses: how many records use this value. */
  inUse?: boolean;
  usageCount?: number;
}

/** A list key as used in the API path, e.g. /reference/deal-stages. */
export type ReferenceListKey =
  | 'industries'
  | 'deal-stages'
  | 'contact-types'
  | 'task-statuses'
  | 'task-priorities';

export interface ReferenceListMeta {
  key: ReferenceListKey;
  label: string;
  noun: string;
  required: boolean;
  extra: { key: 'outcome' | 'winChance' | 'isDone' | 'icon'; label: string }[];
  /** Field key for the single/multiple setting, or null if not applicable. */
  multiField: string | null;
  /** Current single-vs-multiple setting, or null if not applicable. */
  allowMultiple: boolean | null;
}

// ---- Backups ----
export type BackupKind = 'auto' | 'manual' | 'pre-update';

export interface BackupInfo {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

export interface BackupStatus {
  running: boolean;
  lastSuccess: string | null;
  lastError: { message: string; at: string } | null;
  directory: string;
  keep: Record<BackupKind, number>;
  checkedEveryHours: number;
  maxAgeHours: number;
}

export interface ReferenceCatalog {
  lists: ReferenceListMeta[];
}

export interface ReferenceListResponse {
  key: ReferenceListKey;
  values: ReferenceValue[];
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleProfile?: { id: string; name: string; isSystem: boolean };
  /** Effective permissions. Present for the signed-in user. */
  permissions?: string[];
  /** True while the user still has a temporary password. */
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ADMINISTRATOR_PROFILE_ID = 'administrator';

export interface RoleProfile {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionCatalog {
  areas: { key: string; label: string; permissions: { key: string; action: 'view' | 'create' | 'edit' | 'delete' }[] }[];
  admin: { key: string; label: string; description: string }[];
}

export interface Company {
  id: string;
  name: string;
  /** Flattened reference values (the API turns the join rows into plain values). */
  industries?: ReferenceValue[];
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { people: number; deals: number };
  people?: Person[];
  deals?: Deal[];
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  company?: Company | null;
  owner?: Partial<User> | null;
  contacts?: Contact[];
  tasks?: Task[];
  deals?: Deal[];
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  title: string;
  amount: number;
  stageId: string;
  stage: ReferenceValue;
  companyId?: string | null;
  personId?: string | null;
  ownerId?: string | null;
  expectedCloseDate?: string | null;
  company?: Partial<Company> | null;
  person?: Partial<Person> | null;
  owner?: Partial<User> | null;
  contacts?: Contact[];
  tasks?: Task[];
  /** How many tasks sit under this deal (present on the deal list). */
  _count?: { tasks: number };
  createdAt: string;
  updatedAt: string;
}

/** One move of a deal to another stage: when, who, from where to where, and why. */
export interface DealStageChange {
  id: string;
  comment: string;
  userId: string | null;
  /** The name at the time, so it still reads correctly if the person is later removed. */
  userName: string;
  createdAt: string;
  fromStage: { id: string; name: string; colour: ReferenceColour };
  toStage: { id: string; name: string; colour: ReferenceColour };
}

export interface Contact {
  id: string;
  typeId: string;
  type: ReferenceValue;
  subject: string;
  description?: string | null;
  personId?: string | null;
  dealId?: string | null;
  userId?: string | null;
  person?: Partial<Person> | null;
  deal?: Partial<Deal> | null;
  user?: Partial<User> | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  statusId: string;
  priorityId: string;
  status: ReferenceValue;
  priority: ReferenceValue;
  personId?: string | null;
  dealId?: string | null;
  assigneeId?: string | null;
  /** The Contact (touchpoint) this task follows up, if it came from one. */
  contactId?: string | null;
  contact?: { id: string; subject: string; createdAt?: string; type?: { id: string; name: string } } | null;
  person?: Partial<Person> | null;
  deal?: Partial<Deal> | null;
  assignee?: Partial<User> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PipelineStage {
  stage: ReferenceValue;
  count: number;
  value: number;
}

export interface ForecastRow {
  /** 'overdue', 'none', or a month as 'YYYY-MM'. */
  key: string;
  kind: 'overdue' | 'month' | 'none';
  count: number;
  value: number;
  weighted: number;
}

// ---- Reports: deals over time ----
export interface ReportMoney {
  count: number;
  value: number;
}

export interface ReportOpenMoney extends ReportMoney {
  /** Sum of amount x the stage's win chance. */
  weighted: number;
}

export interface ReportMonthRow {
  key: string;
  created: ReportMoney;
  won: ReportMoney;
  lost: ReportMoney;
  moves: number;
}

export interface ReportStalledDeal {
  id: string;
  title: string;
  amount: number;
  stage: { id: string; name: string; colour: ReferenceColour };
  ownerName: string | null;
  days: number;
  since: string;
  /** True when it may have moved before history began, so the real time could be shorter. */
  approximate: boolean;
}

export interface ReportPerson {
  ownerId: string | null;
  name: string;
  open: ReportOpenMoney;
  created: ReportMoney;
  won: ReportMoney;
  lost: ReportMoney;
}

export interface DealReport {
  months: string[];
  summary: {
    created: ReportMoney;
    won: ReportMoney;
    lost: ReportMoney;
    winRate: number | null;
    open: ReportOpenMoney;
  };
  byMonth: ReportMonthRow[];
  movement: {
    stages: { id: string; name: string; colour: ReferenceColour }[];
    rows: { key: string; counts: Record<string, number> }[];
    totals: Record<string, number>;
  };
  closedDateUnknown: { won: ReportMoney; lost: ReportMoney };
  stalled: { total: number; items: ReportStalledDeal[] };
  byPerson: ReportPerson[];
  options: { months: number; ownerId: string | null };
  owners: { id: string; name: string }[];
  /** When stage-move history began, or null if unknown. */
  historySince: string | null;
}

/** A short list plus the true total, so the screen can say "and 3 more". */
export interface AttentionSection<T> {
  count: number;
  items: T[];
}

export interface AttentionTask {
  id: string;
  title: string;
  dueDate: string | null;
  priority?: { id: string; name: string; colour: ReferenceColour } | null;
  person?: { id: string; firstName: string; lastName: string } | null;
  deal?: { id: string; title: string } | null;
}

export interface AttentionDeal {
  id: string;
  title: string;
  amount: number;
  /** Whole days since the last contact. */
  quietDays?: number;
  /** Whole days past the expected close date. */
  daysLate?: number;
}

/** Each section is null when the person can't view that area. */
export interface Attention {
  overdueTasks: AttentionSection<AttentionTask> | null;
  staleDeals: AttentionSection<AttentionDeal> | null;
  pastDueDeals: AttentionSection<AttentionDeal> | null;
}

export interface Forecast {
  count: number;
  total: number;
  weighted: number;
  rows: ForecastRow[];
}

/** Sections the user can't view come back as null. */
export interface DashboardSummary {
  totalPeople: number | null;
  totalCompanies: number | null;
  openDeals: number | null;
  pipelineValue: number | null;
  dealsByStage: PipelineStage[] | null;
  forecast?: Forecast | null;
  attention?: Attention | null;
  upcomingTasks: Task[] | null;
  recentContacts: Contact[] | null;
}

export interface SearchResultItem {
  type: 'person' | 'company' | 'deal';
  id: string;
  label: string;
  sublabel?: string;
}

export interface SearchResults {
  people: SearchResultItem[];
  companies: SearchResultItem[];
  deals: SearchResultItem[];
}

export interface ImportResult {
  total: number;
  imported: number;
  errors: { row: number; message: string }[];
}

export interface ErdField {
  name: string;
  type: string;
  isId: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isList: boolean;
  kind: 'scalar' | 'object' | 'enum' | string;
  relationName?: string;
}

export interface ErdModel {
  name: string;
  dbName: string | null;
  fields: ErdField[];
}

export interface ErdRelation {
  from: string;
  to: string;
  name: string;
  fromField: string;
  fromKey: string | null;
  toKey: string | null;
  type: 'one' | 'many';
}

export interface ErdResponse {
  models: ErdModel[];
  relations: ErdRelation[];
}

// ---- Schema editing ----
export type ScalarType = 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime';
export const SCALAR_TYPES: ScalarType[] = ['String', 'Int', 'Float', 'Boolean', 'DateTime'];

export type SchemaOp =
  | { kind: 'addField'; model: string; field: { name: string; type: ScalarType; required: boolean; unique: boolean; defaultValue?: string | number | boolean | null } }
  | { kind: 'updateField'; model: string; field: string; changes: { name?: string; type?: ScalarType; required?: boolean; unique?: boolean } }
  | { kind: 'dropField'; model: string; field: string }
  | { kind: 'addEntity'; name: string; fields?: { name: string; type: ScalarType; required: boolean; unique: boolean; defaultValue?: string | number | boolean | null }[] }
  | { kind: 'dropEntity'; name: string }
  | { kind: 'addRelation'; from: string; to: string; fkName: string; optional: boolean; onDelete?: 'SetNull' | 'Cascade' | 'Restrict' | 'NoAction' }
  | { kind: 'dropRelation'; from: string; relationField: string };

export interface SchemaCapabilities {
  editingEnabled: boolean;
}

export interface PreviewResult {
  sql: string;
  destructive: boolean;
  warnings: string[];
}

export interface ApplyResult {
  success: boolean;
  migrationName?: string;
  error?: string;
}

/** One line of the audit log: who did what to which record, and what changed. */
export interface AuditEntry {
  id: number;
  at: string;
  /** null means nobody was signed in (a script, an automatic task): shown as System. */
  actor: { id: string | null; name: string } | null;
  action: string;
  entity: string;
  entityLabel: string;
  recordId: string | null;
  recordLabel: string | null;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  /** For a create or a delete: every value the record had. */
  values: { field: string; value: string }[] | null;
}

export interface AuditPage extends Paginated<AuditEntry> {
  /** When auditing began. Changes before this are not in the log. */
  since: string | null;
}
