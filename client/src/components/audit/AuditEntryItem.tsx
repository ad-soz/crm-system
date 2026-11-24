import { Link } from 'react-router-dom';
import type { AuditEntry } from '@/types';

const RECORD_PAGES: Record<string, string> = { people: '/people', companies: '/companies', deals: '/deals' };

/** What happened, in words. */
const VERB: Record<string, string> = {
  create: 'created',
  update: 'changed',
  delete: 'deleted',
  sign_in: 'signed in',
  sign_in_failed: 'failed to sign in',
  export: 'exported data',
  backup: 'made a backup',
};

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

const shown = (value: string | null) => (value === null || value === '' ? <em className="text-muted-foreground">empty</em> : value);

/**
 * One line of history. Used on the Audit log page (with the record named and linked)
 * and on a record's own History card (where the record is already known).
 */
export function AuditEntryItem({ entry, showRecord = true }: { entry: AuditEntry; showRecord?: boolean }) {
  const who = entry.actor?.name ?? 'System';
  const page = RECORD_PAGES[entry.entity];
  const deleted = entry.recordLabel?.endsWith('(deleted)');
  const name = entry.recordLabel ?? entry.recordId;

  return (
    <li className="py-3 text-sm">
      <p>
        <span className="font-medium">{who}</span> {VERB[entry.action] ?? entry.action}
        {showRecord && entry.entity !== 'session' && (
          <>
            {' '}
            {entry.action === 'export' || entry.action === 'backup' ? null : <span className="text-muted-foreground">{entry.entityLabel.toLowerCase()} </span>}
            {name && page && !deleted && entry.recordId ? (
              <Link to={`${page}/${entry.recordId}`} className="font-medium hover:underline">{name}</Link>
            ) : (
              name && <span className="font-medium">{name}</span>
            )}
          </>
        )}
        <span className="ml-2 text-xs text-muted-foreground">{formatWhen(entry.at)}</span>
      </p>

      {entry.action === 'update' && entry.fieldLabel && (
        <p className="mt-0.5 text-muted-foreground">
          <span className="font-medium text-foreground">{entry.fieldLabel}:</span> <span>{shown(entry.oldValue)}</span> <span aria-label="changed to">→</span> <span>{shown(entry.newValue)}</span>
        </p>
      )}

      {(entry.action === 'sign_in_failed' || entry.action === 'export' || entry.action === 'backup') && entry.newValue && (
        <p className="mt-0.5 text-muted-foreground">{entry.newValue}</p>
      )}

      {entry.values && entry.values.length > 0 && (
        <details className="mt-1 text-muted-foreground">
          <summary className="cursor-pointer text-xs hover:text-foreground">{entry.action === 'delete' ? 'What it contained' : 'Starting values'}</summary>
          <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
            {entry.values.map((v) => (
              <div key={v.field} className="contents">
                <dt className="font-medium text-foreground">{v.field}</dt>
                <dd className="break-words">{v.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  );
}
