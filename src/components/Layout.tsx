import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from './ThemeProvider';
import { Calendar, CheckSquare, LayoutDashboard, LogOut, Menu, X, ChevronLeft, ChevronRight, Moon, Sun, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Chatbot } from './Chatbot';
import { FeedbackButton } from './FeedbackButton';

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await logout();
    setIsLogoutModalOpen(false);
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 ease-in-out relative ${
          isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden opacity-0'
        }`}
      >
        <div className="p-6 flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">PM Suite</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="md:hidden">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <LayoutDashboard className="mr-3 h-5 w-5" />
            Dashboard
          </NavLink>
          <NavLink
            to="/notes"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <Calendar className="mr-3 h-5 w-5" />
            Meeting Notes
          </NavLink>
          <NavLink
            to="/tasks"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <CheckSquare className="mr-3 h-5 w-5" />
            Tasks
          </NavLink>
          <NavLink
            to="/cowork"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <MessageSquare className="mr-3 h-5 w-5" />
            Cowork
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Theme</span>
            <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-full p-1">
              <button
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded-full transition-colors ${theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
                title="Light mode"
              >
                <Sun className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-full transition-colors ${theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
                title="Dark mode"
              >
                <Moon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || 'User'} />
              <AvatarFallback>{user?.displayName?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div className="ml-3 flex-1 overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsLogoutModalOpen(true)} title="Sign out">
              <LogOut className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
          <div className="mt-4">
             <FeedbackButton className="w-full justify-start text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" variant="ghost" size="sm" />
          </div>
        </div>
        
        {/* Hide Sidebar Button */}
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => setIsSidebarOpen(false)} 
          className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-white dark:bg-gray-900 shadow-md border border-gray-200 dark:border-gray-800 z-20 hidden md:flex"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col relative bg-gray-50 dark:bg-gray-950">
        {!isSidebarOpen && (
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setIsSidebarOpen(true)} 
            className="absolute left-4 top-6 h-8 w-8 rounded-full bg-white dark:bg-gray-900 shadow-md border border-gray-200 dark:border-gray-800 z-20 hidden md:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        <div className="absolute top-4 left-4 z-10 flex space-x-2 md:hidden">
          {!isSidebarOpen && (
            <Button variant="outline" size="icon" onClick={() => setIsSidebarOpen(true)} className="bg-white dark:bg-gray-900 shadow-sm">
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Outlet />
      </main>

      <Chatbot />

      <Dialog open={isLogoutModalOpen} onOpenChange={setIsLogoutModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>Are you sure you want to sign out?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogoutModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleLogout}>Sign Out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
