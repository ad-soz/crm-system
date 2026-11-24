import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/AppLayout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import People from '@/pages/People';
import PersonDetail from '@/pages/PersonDetail';
import Companies from '@/pages/Companies';
import CompanyDetail from '@/pages/CompanyDetail';
import Deals from '@/pages/Deals';
import DealDetail from '@/pages/DealDetail';
import Reports from '@/pages/Reports';
import Tasks from '@/pages/Tasks';
import Contacts from '@/pages/Contacts';
import Analyse from '@/pages/Analyse';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { MyDetailsSection } from '@/components/settings/MyDetailsSection';
import { AppearanceSection } from '@/components/appearance/AppearanceSection';
import { UsersSection } from '@/components/users/UsersSection';
import { RoleProfilesSection } from '@/components/users/RoleProfilesSection';
import { BackupsSection } from '@/components/backups/BackupsSection';
import { AuditSection } from '@/components/audit/AuditSection';
import ReferenceData from '@/pages/ReferenceData';
import DataModel from '@/pages/DataModel';
import Account from '@/pages/Account';
import { ThemeProvider } from '@/context/ThemeContext';
import { RequirePermission } from '@/components/RequirePermission';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/people" element={<RequirePermission permission="people.view"><People /></RequirePermission>} />
                <Route path="/people/:id" element={<RequirePermission permission="people.view"><PersonDetail /></RequirePermission>} />
                <Route path="/companies" element={<RequirePermission permission="companies.view"><Companies /></RequirePermission>} />
                <Route path="/companies/:id" element={<RequirePermission permission="companies.view"><CompanyDetail /></RequirePermission>} />
                <Route path="/deals" element={<RequirePermission permission="deals.view"><Deals /></RequirePermission>} />
                <Route path="/deals/:id" element={<RequirePermission permission="deals.view"><DealDetail /></RequirePermission>} />
                <Route path="/reports" element={<RequirePermission permission="deals.view"><Reports /></RequirePermission>} />
                <Route path="/tasks" element={<RequirePermission permission="tasks.view"><Tasks /></RequirePermission>} />
                <Route path="/contacts" element={<RequirePermission permission="contacts.view"><Contacts /></RequirePermission>} />
                <Route path="/analyse/:subject" element={<Analyse />} />
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="profile" replace />} />
                  <Route path="profile" element={<MyDetailsSection />} />
                  <Route path="appearance" element={<AppearanceSection />} />
                  <Route path="users" element={<RequirePermission permission="users.manage"><UsersSection /></RequirePermission>} />
                  <Route path="roles" element={<RequirePermission permission="profiles.manage"><RoleProfilesSection /></RequirePermission>} />
                  <Route path="reference-data" element={<RequirePermission permission="reference.manage"><ReferenceData /></RequirePermission>} />
                  <Route path="backups" element={<RequirePermission permission="backups.manage"><BackupsSection /></RequirePermission>} />
                  <Route path="audit" element={<RequirePermission permission="audit.view"><AuditSection /></RequirePermission>} />
                  <Route path="data-model" element={<RequirePermission permission="datamodel.view"><DataModel /></RequirePermission>} />
                  <Route path="*" element={<Navigate to="profile" replace />} />
                </Route>
                {/* Appearance now lives in Settings; keep old links working. */}
                <Route path="/appearance" element={<Navigate to="/settings/appearance" replace />} />
                <Route path="/account" element={<Account />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
