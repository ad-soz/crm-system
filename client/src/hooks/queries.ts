import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Company,
  Person,
  Deal,
  Task,
  Contact,
  Paginated,
  DashboardSummary,
  PipelineStage,
  User,
  ReferenceCatalog,
  ReferenceListResponse,
  ReferenceListKey,
} from '@/types';

// ---- Dashboard ----
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard')).data,
  });
}

// ---- Companies ----
export function useCompanies(params: { page?: number; search?: string } = {}) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: async () => (await api.get<Paginated<Company>>('/companies', { params })).data,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: async () => (await api.get<Company>(`/companies/${id}`)).data,
    enabled: !!id,
  });
}

export function useAllCompanies() {
  return useQuery({
    queryKey: ['companies-all'],
    queryFn: async () => (await api.get<Paginated<Company>>('/companies', { params: { limit: 500 } })).data.data,
  });
}

// ---- People ----
export function usePeople(params: { page?: number; search?: string; companyId?: string } = {}) {
  return useQuery({
    queryKey: ['people', params],
    queryFn: async () => (await api.get<Paginated<Person>>('/people', { params })).data,
  });
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: ['person', id],
    queryFn: async () => (await api.get<Person>(`/people/${id}`)).data,
    enabled: !!id,
  });
}

export function useAllPeople() {
  return useQuery({
    queryKey: ['people-all'],
    queryFn: async () => (await api.get<Paginated<Person>>('/people', { params: { limit: 500 } })).data.data,
  });
}

// ---- Deals ----
export function useDeals(params: { stageId?: string; limit?: number } = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['deals', params],
    queryFn: async () => (await api.get<Paginated<Deal>>('/deals', { params })).data,
    enabled: options.enabled ?? true,
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: async () => (await api.get<Deal>(`/deals/${id}`)).data,
    enabled: !!id,
  });
}

/** How deals change over time. Always re-read when the page opens, so it never shows stale figures. */
export function useDealReport(months: number, ownerId: string) {
  return useQuery({
    queryKey: ['report-deals', months, ownerId],
    queryFn: async () =>
      (
        await api.get<import('@/types').DealReport>('/reports/deals', {
          params: { months, ...(ownerId ? { ownerId } : {}) },
        })
      ).data,
    staleTime: 0,
    // Keep showing the previous figures while a new period or person loads.
    placeholderData: (previous) => previous,
  });
}

/** A deal's stage moves, newest first. */
export function useDealHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['deal-history', id],
    queryFn: async () => (await api.get<import('@/types').DealStageChange[]>(`/deals/${id}/history`)).data,
    enabled: !!id,
  });
}

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    queryFn: async () => (await api.get<PipelineStage[]>('/deals/pipeline')).data,
  });
}

// ---- Tasks ----
export function useTasks(params: { statusId?: string; assigneeId?: string } = {}) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => (await api.get<Paginated<Task>>('/tasks', { params })).data,
  });
}

// ---- Contacts ----
export function useContacts(params: { typeId?: string; personId?: string; dealId?: string } = {}) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: async () => (await api.get<Paginated<Contact>>('/contacts', { params })).data,
  });
}

// ---- Analysis behind the dashboard cards ----
export interface AnalyseData<R> {
  subject: 'people' | 'companies' | 'deals';
  rows: R[];
  total: number;
  /** True when there are more rows than were sent. */
  truncated: boolean;
  limit: number;
}

export function useAnalyse<R>(dataset: 'people' | 'companies' | 'deals', enabled = true) {
  return useQuery({
    queryKey: ['analyse', dataset],
    queryFn: async () => (await api.get<AnalyseData<R>>(`/analyse/${dataset}`)).data,
    enabled,
    // Always the current figures: a drill-down that disagrees with its card is worse than a slow one.
    staleTime: 0,
  });
}

// ---- Audit log ----
export interface AuditParams {
  entity?: string;
  recordId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useAudit(params: AuditParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: async () => (await api.get<import('@/types').AuditPage>('/audit', { params })).data,
    enabled: options.enabled ?? true,
    // Always show what is true now, never a copy from earlier.
    staleTime: 0,
    placeholderData: (previous) => previous,
  });
}

export function useAuditFilters(enabled = true) {
  const entities = useQuery({
    queryKey: ['audit-entities'],
    queryFn: async () => (await api.get<{ value: string; label: string }[]>('/audit/entities')).data,
    enabled,
  });
  const actors = useQuery({
    queryKey: ['audit-actors'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/audit/actors')).data,
    enabled,
  });
  return { entities: entities.data ?? [], actors: actors.data ?? [] };
}

// ---- Users ----
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<Paginated<User>>('/users')).data,
  });
}

// ---- Generic mutation helper ----
export function useInvalidate() {
  const qc = useQueryClient();
  // Anything that was saved or deleted is also a new line in the audit log.
  return (keys: string[]) => [...keys, 'audit', 'audit-actors', 'audit-entities'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export { useMutation };

// ---- Schema / ERD ----
export function useErd() {
  return useQuery({
    queryKey: ['erd'],
    queryFn: async () => (await api.get<import('@/types').ErdResponse>('/schema/erd')).data,
    staleTime: Infinity,
  });
}

// ---- Schema editing ----
export function useSchemaCapabilities() {
  return useQuery({
    queryKey: ['schema-capabilities'],
    queryFn: async () =>
      (await api.get<import('@/types').SchemaCapabilities>('/schema/capabilities')).data,
    staleTime: Infinity,
  });
}

// ---- Reference data ----
// Readable by anyone signed in; forms use these to show their options.
export function useReferenceCatalog() {
  return useQuery({
    queryKey: ['reference-catalog'],
    queryFn: async () => (await api.get<ReferenceCatalog>('/reference/catalog')).data,
    staleTime: 60_000,
  });
}

export function useReferenceList(key: ReferenceListKey, enabled = true) {
  return useQuery({
    queryKey: ['reference', key],
    queryFn: async () => (await api.get<ReferenceListResponse>(`/reference/${key}`)).data,
    staleTime: 60_000,
    enabled,
  });
}

/** Just the active values of a list, ready for a Select (forms shouldn't offer retired values). */
export function useActiveReferenceValues(key: ReferenceListKey) {
  const query = useReferenceList(key);
  const active = (query.data?.values ?? []).filter((v) => v.isActive);
  return { ...query, values: active };
}

/** Job-title suggestions for the free-text person title field. */
export function useTitleSuggestions(q: string) {
  return useQuery({
    queryKey: ['title-suggestions', q],
    queryFn: async () => (await api.get<string[]>('/people/meta/titles', { params: { q } })).data,
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });
}

/** Invalidate every reference query plus anything that embeds reference values. */
export function useInvalidateReference() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['reference'] });
    qc.invalidateQueries({ queryKey: ['reference-catalog'] });
    ['deals', 'pipeline', 'tasks', 'contacts', 'companies', 'companies-all', 'dashboard'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
}

// ---- Backups ----
export function useBackups() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: async () =>
      (await api.get<{ backups: import('@/types').BackupInfo[]; status: import('@/types').BackupStatus }>('/backups')).data,
    // Refresh now and then so an automatic backup shows up without a reload.
    refetchInterval: 5 * 60 * 1000,
  });
}

// ---- Role profiles ----
export function useRoleProfiles(enabled = true) {
  return useQuery({
    queryKey: ['role-profiles'],
    queryFn: async () => (await api.get<import('@/types').RoleProfile[]>('/role-profiles')).data,
    enabled,
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: ['permission-catalog'],
    queryFn: async () => (await api.get<import('@/types').PermissionCatalog>('/role-profiles/catalog')).data,
    staleTime: Infinity,
    enabled,
  });
}
