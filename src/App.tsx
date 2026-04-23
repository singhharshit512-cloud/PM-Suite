/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import { ThemeProvider } from './components/ThemeProvider';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { Notes } from './pages/Notes';
import { Tasks } from './pages/Tasks';
import { Cowork } from './pages/Cowork';
import { Toaster } from './components/ui/sonner';

import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminCowork } from './pages/admin/AdminCowork';
import { AdminIntegrations } from './pages/admin/AdminIntegrations';
import { AdminUsage } from './pages/admin/AdminUsage';
import { AdminLogs } from './pages/admin/Logs';
import { AdminAudit } from './pages/admin/AdminAudit';
import { AdminFeedback } from './pages/admin/AdminFeedback';

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <AdminAuthProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route element={<AdminLayout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/cowork" element={<AdminCowork />} />
              <Route path="/admin/integrations" element={<AdminIntegrations />} />
              <Route path="/admin/usage" element={<AdminUsage />} />
              <Route path="/admin/logs" element={<AdminLogs />} />
              <Route path="/admin/audit" element={<AdminAudit />} />
              <Route path="/admin/feedback" element={<AdminFeedback />} />
            </Route>

            {/* App Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/cowork" element={<Cowork />} />
              </Route>
            </Route>
          </Routes>
        </Router>
        <Toaster />
      </AuthProvider>
      </AdminAuthProvider>
    </ThemeProvider>
  );
}


