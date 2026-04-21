import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { Button } from '../../components/ui/button';
import { LayoutDashboard, Users, Bot, Key, Activity, ShieldAlert, FileText, LogOut } from 'lucide-react';

export function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();

  if (!admin) {
      return null; // The route guard will redirect
  }

  const navLinks = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Users', path: '/admin/users', icon: Users },
    { name: 'Cowork Config', path: '/admin/cowork', icon: Bot },
    { name: 'Integrations', path: '/admin/integrations', icon: Key },
    { name: 'Usage', path: '/admin/usage', icon: Activity },
    { name: 'Logs', path: '/admin/logs', icon: FileText },
    { name: 'Audit Log', path: '/admin/audit', icon: ShieldAlert },
  ];

  return (
    <div className="flex h-screen bg-gray-50 border-t-4 border-red-500 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <span className="text-lg font-bold tracking-tight text-gray-900">PM Suite <span className="text-red-500">Admin</span></span>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navLinks.map(link => {
             const isActive = location.pathname.startsWith(link.path);
             return (
               <Link
                 key={link.name}
                 to={link.path}
                 className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                   isActive ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                 }`}
               >
                 <link.icon className="h-4 w-4" />
                 {link.name}
               </Link>
             )
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
           <Button variant="ghost" className="w-full justify-start text-gray-600 hover:text-red-600" onClick={logout}>
               <LogOut className="h-4 w-4 mr-2" /> Logout
           </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-8">
            <div className="flex items-center gap-3">
                <span className="text-xs font-medium px-2 py-1 bg-red-100 text-red-700 rounded-full">{(admin as any).role.toUpperCase()}</span>
                <span className="text-sm font-medium text-gray-700">{(admin as any).email || 'Admin'}</span>
            </div>
        </div>
        <div className="p-8 max-w-7xl mx-auto">
           <Outlet />
        </div>
      </main>
    </div>
  );
}
