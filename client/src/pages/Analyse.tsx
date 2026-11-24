import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Columns3, Filter, X } from 'lucide-react';
import { useAnalyse } from '@/hooks/queries';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { ExportButton } from '@/components/reports/ExportButton';
import { AnalyseFilters } from '@/components/analyse/AnalyseFilters';
import { AnalyseGroups } from '@/components/analyse/AnalyseGroups';
import { AnalyseTable } from '@/components/analyse/AnalyseTable';
import {
  SUBJECTS,
  companyColumns,
  dealColumns,
  isSubject,
  personColumns,
  type CompanyRow,
  type DealRow,
  type PersonRow,
  type SubjectInfo,
  type TableColumn,
} from '@/components/analyse/subjects';
import {
  applyFilters,
  canGroup,
  countFilters,
  exportRows,
  groupRows,
  isNumeric,
  numberValue,
  parseView,
  sortRows,
  summarise,
  viewToParams,
  type Filters,
  type View,
} from '@/lib/analyse';
import { formatCurrency } from '@/lib/utils';

interface Stat {
  label: string;
  value: string;
}

const whole = (n: number) => n.toLocaleString('en-US');

/**
 * A dashboard card, opened up. The rows behind the figure, which you can search,
 * filter, group, chart, sort, choose columns for, and export. Every choice is kept in
 * the address, so a view can be bookmarked or sent to someone.
 */
export default function Analyse() {
  const { subject } = useParams();
  const { can } = usePermissions();
  if (!isSubject(subject)) return <Navigate to="/" replace />;
  const info = SUBJECTS[subject];
  if (!can(info.permission)) {
    return (
      <div>
        <BackLink />
        <EmptyState title="Not available" description="Your role profile does not include this area." />
      </div>
    );
  }
  return <Loaded info={info} />;
}

function BackLink() {
  return (
    <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard
    </Link>
  );
}

function Loaded({ info }: { info: SubjectInfo }) {
  // The three kinds of row have different columns; each is analysed by the same screen.
  if (info.dataset === 'people') return <Workbench<PersonRow> info={info} makeColumns={personColumns} stats={personStats} />;
  if (info.dataset === 'companies') return <Workbench<CompanyRow> info={info} makeColumns={makeCompanyColumns} stats={companyStats} />;
  return <Workbench<DealRow> info={info} makeColumns={dealColumns} stats={dealStats} />;
}

// Must keep one identity from render to render, or the columns are rebuilt every time.
const makeCompanyColumns = () => companyColumns();

// ---------------------------------------------------------------- the figures at the top

function sumOf<R>(rows: R[], columns: TableColumn<R>[], key: string) {
  const col = columns.find((c) => c.key === key)!;
  const s = summarise(rows, col);
  return s.counted === 0 && rows.length > 0 ? null : s;
}

function dealStats(rows: DealRow[], columns: TableColumn<DealRow>[], closed: boolean): Stat[] {
  const amount = sumOf(rows, columns, 'amount');
  const expected = sumOf(rows, columns, 'expected');
  return [
    { label: closed ? 'Deals' : 'Open deals', value: whole(rows.length) },
    { label: closed ? 'Total amount' : 'Pipeline value', value: formatCurrency(amount?.sum ?? 0) },
    { label: 'Weighted forecast', value: formatCurrency(expected?.sum ?? 0) },
    { label: 'Average deal', value: amount?.average == null ? '-' : formatCurrency(amount.average) },
  ];
}

function personStats(rows: PersonRow[], columns: TableColumn<PersonRow>[]): Stat[] {
  const value = sumOf(rows, columns, 'openDealValue');
  const tasks = sumOf(rows, columns, 'openTasks');
  const col = columns.find((c) => c.key === 'openDeals')!;
  const withDeals = rows.filter((r) => (numberValue(col, r) ?? 0) > 0).length;
  const out: Stat[] = [{ label: 'People', value: whole(rows.length) }];
  if (value) out.push({ label: 'With open deals', value: whole(withDeals) }, { label: 'Open deal value', value: formatCurrency(value.sum) });
  if (tasks) out.push({ label: 'Open tasks', value: whole(tasks.sum) });
  return out;
}

function companyStats(rows: CompanyRow[], columns: TableColumn<CompanyRow>[]): Stat[] {
  const people = sumOf(rows, columns, 'people');
  const deals = sumOf(rows, columns, 'openDeals');
  const value = sumOf(rows, columns, 'openDealValue');
  const out: Stat[] = [{ label: 'Companies', value: whole(rows.length) }];
  if (people) out.push({ label: 'People', value: whole(people.sum) });
  if (deals) out.push({ label: 'Open deals', value: whole(deals.sum) });
  if (value) out.push({ label: 'Open deal value', value: formatCurrency(value.sum) });
  return out;
}

/** Which figure on the page is the one on the dashboard card. */
const CARD_STAT: Record<string, number> = { people: 0, companies: 0, 'open-deals': 0, pipeline: 1, forecast: 2 };

// ---------------------------------------------------------------- the workbench

function Workbench<R extends { id: string }>({
  info,
  makeColumns,
  stats,
}: {
  info: SubjectInfo;
  makeColumns: (now: number) => TableColumn<R>[];
  stats: (rows: R[], columns: TableColumn<R>[], closed: boolean) => Stat[];
}) {
  const { data, isLoading, isError } = useAnalyse<R>(info.dataset);
  const [params, setParams] = useSearchParams();
  const [showColumns, setShowColumns] = useState(false);
  const [showFilters, setShowFilters] = useState(() => countFilters(parseView(params, [], info.defaults).filters) > 0 || [...params.keys()].some((k) => /^(f|min|max|from|to)\./.test(k)));
  const now = useMemo(() => Date.now(), []);
  const allColumns = useMemo(() => makeColumns(now), [makeColumns, now]);

  // A column the person may not see comes back empty on every row; leave it out entirely.
  const columns = useMemo(
    () => (data ? allColumns.filter((c) => data.rows.length === 0 || data.rows.some((r) => c.get(r) !== null)) : allColumns),
    [allColumns, data],
  );

  const view: View = useMemo(() => parseView(params, columns, info.defaults), [params, columns, info.defaults]);

  const change = (next: Partial<View>, keepPage = false) => {
    const merged = { ...view, ...next, page: keepPage ? (next.page ?? view.page) : (next.page ?? 1) };
    setParams(viewToParams(merged, info.defaults), { replace: true });
  };
  const setFilters = (filters: Filters) => change({ filters });

  // Open deals unless the person asks for won and lost as well.
  const base = useMemo(() => {
    if (!data) return [] as R[];
    if (info.openOnly && !view.closed) return data.rows.filter((r) => (r as unknown as DealRow).outcome === 'OPEN');
    return data.rows;
  }, [data, info.openOnly, view.closed]);

  const filtered = useMemo(() => applyFilters(base, columns, view.filters), [base, columns, view.filters]);
  const sortCol = columns.find((c) => c.key === view.sort);
  const sorted = useMemo(() => sortRows(filtered, sortCol, view.dir), [filtered, sortCol, view.dir]);

  const groupCol = columns.find((c) => c.key === view.group && canGroup(c));
  const measureCol = columns.find((c) => c.key === view.measure && isNumeric(c));
  const grouping = useMemo(() => (groupCol ? groupRows(filtered, groupCol, measureCol) : null), [filtered, groupCol, measureCol]);

  const visibleKeys = view.cols ?? columns.filter((c) => c.defaultVisible).map((c) => c.key);
  const visible = columns.filter((c) => visibleKeys.includes(c.key));

  if (isLoading) return <><BackLink /><LoadingState /></>;
  if (isError || !data) return <><BackLink /><ErrorState message="Failed to load the figures" /></>;

  const nFilters = countFilters(view.filters);
  const figures = stats(filtered, columns, info.openOnly ? view.closed : true);
  const cardIndex = CARD_STAT[info.key];
  const unfiltered = nFilters === 0 && !view.closed;

  const sortBy = (key: string) => {
    const col = columns.find((c) => c.key === key)!;
    if (view.sort === key) change({ dir: view.dir === 'asc' ? 'desc' : 'asc' });
    else change({ sort: key, dir: isNumeric(col) || col.type === 'date' ? 'desc' : 'asc' });
  };

  const drill = (key: string) => {
    if (!groupCol) return;
    if (groupCol.type === 'date') {
      const [y, m] = key.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      setFilters({ ...view.filters, dates: { ...view.filters.dates, [groupCol.key]: { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` } } });
    } else {
      setFilters({ ...view.filters, categories: { ...view.filters.categories, [groupCol.key]: [key] } });
    }
    setShowFilters(true);
  };

  const toggleColumn = (key: string) => {
    const next = visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : columns.filter((c) => visibleKeys.includes(c.key) || c.key === key).map((c) => c.key);
    if (next.length) change({ cols: next }, true);
  };

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  const noun = (n: number) => (n === 1 ? info.noun[0] : info.noun[1]);

  return (
    <div className="space-y-5">
      <div>
        <BackLink />
        <h1 className="text-2xl font-semibold">{info.title}</h1>
        <p className="text-sm text-muted-foreground">{info.description}</p>
      </div>

      {data.truncated && (
        <Notice tone="warning">
          There are {whole(data.total)} {info.noun[1]}; the newest {whole(data.rows.length)} are shown here.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Figures">
        {figures.map((s, i) => (
          <Card key={s.label} className={i === cardIndex ? 'ring-1 ring-primary/40' : undefined}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              {i === cardIndex && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {unfiltered ? 'The figure on the dashboard card' : 'Narrowed by your filters'}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1 space-y-1.5">
              <Label htmlFor="analyse-search">Search</Label>
              <Input id="analyse-search" type="search" placeholder={`Search ${info.noun[1]}`} value={view.filters.q} onChange={(e) => setFilters({ ...view.filters, q: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analyse-group">Group by</Label>
              <Select
                id="analyse-group"
                value={view.group}
                placeholder="No grouping"
                options={columns.filter(canGroup).map((c) => ({ value: c.key, label: c.type === 'date' ? `${c.label} (by month)` : c.label }))}
                onValueChange={(v) => change({ group: v }, true)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analyse-measure">Measure</Label>
              <Select
                id="analyse-measure"
                value={view.measure}
                placeholder="Number of rows"
                options={columns.filter(isNumeric).map((c) => ({ value: c.key, label: c.label }))}
                onValueChange={(v) => change({ measure: v }, true)}
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              <Filter className="h-4 w-4" aria-hidden /> Filters{nFilters ? ` (${nFilters})` : ''}
            </Button>
            <div className="relative">
              <Button type="button" variant="outline" onClick={() => setShowColumns((s) => !s)} aria-expanded={showColumns}>
                <Columns3 className="h-4 w-4" aria-hidden /> Columns
              </Button>
              {showColumns && (
                <Card className="absolute right-0 z-20 mt-1 max-h-72 w-56 space-y-1 overflow-y-auto p-3">
                  {columns.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={visibleKeys.includes(c.key)} onChange={() => toggleColumn(c.key)} aria-label={`Show column ${c.label}`} />
                      {c.label}
                    </label>
                  ))}
                </Card>
              )}
            </div>
            <ExportButton name={`${info.title}`} rows={() => exportRows(sorted, visible)} />
          </div>

          {info.openOnly && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={view.closed} onChange={(e) => change({ closed: e.target.checked })} />
              Include won and lost deals
            </label>
          )}

          {showFilters && <AnalyseFilters columns={columns} rows={base} filters={view.filters} onChange={setFilters} />}

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <span>
              Showing {whole(filtered.length)} of {whole(base.length)} {noun(base.length)}
            </span>
            {(nFilters > 0 || view.closed || [...params.keys()].length > 0) && (
              <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
                <X className="h-3.5 w-3.5" aria-hidden /> Start again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {grouping && groupCol && (
        <Card>
          <CardHeader>
            <CardTitle>
              {measureCol ? measureCol.label : 'Rows'} by {groupCol.label.toLowerCase()}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Click a group to look at just those rows.</p>
          </CardHeader>
          <CardContent>
            <AnalyseGroups grouping={grouping} by={groupCol} measure={measureCol} onPick={drill} />
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description={nFilters ? 'Try removing a filter.' : `There are no ${info.noun[1]} yet.`}
          action={nFilters > 0 && <Button onClick={clearAll}>Start again</Button>}
        />
      ) : (
        <AnalyseTable rows={sorted} columns={visible} sort={view.sort} dir={view.dir} onSort={sortBy} page={view.page} onPage={(page) => change({ page }, true)} />
      )}
    </div>
  );
}
