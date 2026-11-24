import type { PermissionCatalog } from '@/types';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

const ACTION_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' } as const;

/**
 * Grid of permission checkboxes: one row per area (view/create/edit/delete),
 * then the admin permissions. Turning on create, edit, or delete also turns
 * on view, and view can't be turned off while any of them is on (the server
 * applies the same rule).
 */
export function PermissionMatrix({
  catalog,
  value,
  onChange,
  disabled,
  grantable,
}: {
  catalog: PermissionCatalog;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Permissions the current user may hand out; others can't be ticked. */
  grantable?: string[];
}) {
  const selected = new Set(value);
  const canGrant = (key: string) => !grantable || grantable.includes(key);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    const [area, action] = key.split('.');
    if (on && ['create', 'edit', 'delete'].includes(action)) next.add(`${area}.view`);
    if (key === 'datamodel.edit' && on) next.add('datamodel.view');
    onChange([...next]);
  };

  const viewLocked = (area: string) =>
    ['create', 'edit', 'delete'].some((a) => selected.has(`${area}.${a}`));

  return (
    <div className="space-y-5">
      <Card flat className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Permissions for each area</caption>
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Area
              </th>
              {(Object.keys(ACTION_LABELS) as (keyof typeof ACTION_LABELS)[]).map((a) => (
                <th key={a} scope="col" className="px-3 py-2 text-center font-medium">
                  {ACTION_LABELS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.areas.map((area) => (
              <tr key={area.key} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {area.label}
                </th>
                {area.permissions.map((p) => {
                  const locked = p.action === 'view' && viewLocked(area.key) && selected.has(p.key);
                  const isDisabled = disabled || !canGrant(p.key) || locked;
                  return (
                    <td key={p.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                        aria-label={`${area.label}: ${ACTION_LABELS[p.action]}`}
                        title={locked ? 'Needed for create, edit, or delete' : undefined}
                        checked={selected.has(p.key)}
                        disabled={isDisabled}
                        onChange={(e) => toggle(p.key, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Administration</legend>
        {catalog.admin.map((p) => {
          const locked = p.key === 'datamodel.view' && selected.has('datamodel.edit');
          return (
            <Card flat key={p.key} className={cn((disabled || !canGrant(p.key)) && 'opacity-60')}>
            <label className="flex items-start gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={selected.has(p.key)}
                disabled={disabled || !canGrant(p.key) || locked}
                onChange={(e) => toggle(p.key, e.target.checked)}
              />
              <span>
                <span className="font-medium">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.description}</span>
              </span>
            </label>
            </Card>
          );
        })}
      </fieldset>
      {grantable && (
        <p className="text-xs text-muted-foreground">
          You can only give permissions that your own profile has.
        </p>
      )}
    </div>
  );
}
