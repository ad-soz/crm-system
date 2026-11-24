import { NavLink, Outlet } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { PageHeader } from '@/components/states';
import { cn } from '@/lib/utils';
import { visibleSections } from './settingsSections';

/**
 * The frame around every Settings page: a menu on the left (grouped, and
 * limited to what the person may use) and the chosen section on the right.
 * On narrow screens the menu sits above the section.
 */
export function SettingsLayout() {
  const { can } = usePermissions();
  const groups = visibleSections(can);

  return (
    <div>
      <PageHeader title="Settings" description="Your details and appearance, and how the CRM is set up" />
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-5 md:sticky md:top-0 md:self-start">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
              <ul className="space-y-0.5">
                {items.map(({ path, label, icon: Icon }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
