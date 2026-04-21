import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AdminUser {
  adminId: string;
  role: string;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return context;
};

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (res.ok) {
          const data = await res.json();
          setAdmin(data);
        } else {
          setAdmin(null);
        }
      } catch (e) {
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async () => {
    try {
      const res = await fetch('/api/admin/auth/url');
      const data = await res.json();
      const popup = window.open(data.url, 'Admin Login', 'width=500,height=600');
      
      const messageListener = (event: MessageEvent) => {
        if (event.data?.type === 'ADMIN_OAUTH_SUCCESS') {
          window.removeEventListener('message', messageListener);
          window.location.href = '/admin?mfa=true';
        }
      };
      window.addEventListener('message', messageListener);
    } catch (e) {
      console.error('Failed to get admin login url', e);
    }
  };

  const logout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setAdmin(null);
    window.location.href = '/admin';
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
