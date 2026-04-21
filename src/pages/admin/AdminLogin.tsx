import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

export function AdminLogin() {
  const { admin, loading, login } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSetup, setMfaSetup] = useState<any>(null);
  const navigate = useNavigate();

  const isMfaStep = searchParams.get('mfa') === 'true';

  useEffect(() => {
    if (isMfaStep) {
      fetch('/api/admin/auth/mfa/setup')
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                // Return to start
                navigate('/admin');
            } else {
                setMfaSetup(data);
            }
        });
    }
  }, [isMfaStep, navigate]);

  const handleVerify = async () => {
    const res = await fetch('/api/admin/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: mfaCode })
    });
    if (res.ok) {
      window.location.href = '/admin'; // reload to fetch me endpoint
    } else {
      alert('Invalid MFA Code');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (admin && admin.role) {
      if (window.location.pathname === '/admin' || window.location.pathname === '/admin/login') {
          return <Navigate to="/admin/dashboard" replace />;
      }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white border-0 shadow-2xl rounded-2xl overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-blue-600 to-purple-600" />
        <CardHeader className="text-center pt-8 pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight text-gray-900">Admin Portal</CardTitle>
          <CardDescription className="text-gray-500">
            {isMfaStep ? 'Two-Factor Authentication' : 'Sign in to access the control panel'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isMfaStep ? (
            <div className="flex flex-col gap-4">
              <Button onClick={login} className="w-full py-6 text-base" size="lg">
                Sign in with Google Workspace
              </Button>
            </div>
          ) : (
             <div className="space-y-6 text-center">
                 {mfaSetup && !mfaSetup.hasTotp && (
                    <div className="mx-auto flex flex-col items-center gap-4 bg-gray-50 p-6 rounded-lg border border-gray-100">
                       <p className="text-sm text-gray-600">Scan this QR code with your authenticator app.</p>
                       <QRCodeSVG value={mfaSetup.otpauth} size={150} />
                       <p className="font-mono text-xs text-gray-400 select-all">{mfaSetup.secret}</p>
                    </div>
                 )}
                 <div className="space-y-2 text-left">
                     <label className="text-sm font-medium text-gray-700">6-Digit Code</label>
                     <Input 
                         value={mfaCode} 
                         onChange={e => setMfaCode(e.target.value)} 
                         placeholder="000000" 
                         className="text-center text-2xl tracking-widest h-14 font-mono"
                         maxLength={6}
                     />
                 </div>
                 <Button onClick={handleVerify} className="w-full" size="lg">Verify & Login</Button>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
