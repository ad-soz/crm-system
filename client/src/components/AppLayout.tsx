import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  CheckSquare,
  Contact,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/GlobalSearch';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/people', label: 'People', icon: Users, permission: 'people.view' },
  { to: '/companies', label: 'Companies', icon: Building2, permission: 'companies.view' },
  { to: '/deals', label: 'Deals', icon: Handshake, permission: 'deals.view' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'deals.view' },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, permission: 'tasks.view' },
  { to: '/contacts', label: 'Contacts', icon: Contact, permission: 'contacts.view' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleItems = navItems.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r bg-muted/20 md:flex">
        <div className="flex h-14 items-center border-b px-6 font-semibold">CRM System</div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-60 flex-col border-r bg-muted/20 transition-transform md:hidden',
          mobileMenuOpen ? 'flex translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-6 font-semibold">
          CRM System
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(false)}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden"
            aria-label="Toggle menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/account"
              className="rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Account and password"
            >
              {user?.firstName} {user?.lastName}
            </Link>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
