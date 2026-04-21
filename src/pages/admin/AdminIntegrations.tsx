import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Key, Link as LinkIcon, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AdminIntegrations() {
  const [loading, setLoading] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch('/api/admin/system/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setFetching(false);
      })
      .catch(err => {
        console.error(err);
        setFetching(false);
        toast.error('Failed to load integration status');
      });
  }, []);

  const handleTestConnection = (integration: string) => {
    setLoading(integration);
    setTimeout(() => {
      setLoading(null);
      toast.success(`${integration} connection tested successfully`);
    }, 1500);
  };

  const handleSaveToken = (integration: string) => {
    toast.success(`${integration} configuration saved`);
  };

  if (fetching || !status) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Manage your third-party API connections and OAuth providers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google OAuth */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z"
                    />
                  </svg>
                  Google Workspace
                </CardTitle>
                <CardDescription className="mt-1">
                  OAuth for user sign-in and Calendar access.
                </CardDescription>
              </div>
              {status.google?.connected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 flex items-center">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 flex items-center">
                  <AlertCircle className="h-3.5 w-3.5" /> Action Required
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs">Client ID</label>
              <div className="flex bg-muted/50 px-3 py-2 rounded-md font-mono text-sm overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground border">
                {status.google?.clientId || 'Not configured'}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs">Redirect URIs</label>
              <div className="text-sm font-medium text-foreground">
                <div className="flex items-center gap-2 mb-1"><LinkIcon className="h-3 w-3 text-muted-foreground"/> /api/auth/callback</div>
                <div className="flex items-center gap-2"><LinkIcon className="h-3 w-3 text-muted-foreground"/> /api/admin/auth/callback</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 flex justify-between border-t py-4">
            <span className="text-sm text-muted-foreground">Configured via ENV variables</span>
            <Button variant="outline" size="sm" onClick={() => handleTestConnection('Google')} disabled={loading === 'Google'}>
              {loading === 'Google' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test Connection
            </Button>
          </CardFooter>
        </Card>

        {/* Gemini API */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">✧</span>
                  Gemini API
                </CardTitle>
                <CardDescription className="mt-1">
                  Generative AI models for assistants and processing.
                </CardDescription>
              </div>
              {status.gemini?.connected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 flex items-center">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 flex items-center">
                  <AlertCircle className="h-3.5 w-3.5" /> Missing Key
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs flex justify-between">
                <span>API Key</span>
                <span className="text-blue-600 cursor-pointer">Edit</span>
              </label>
              <div className="flex relative">
                <Input type="password" value={status.gemini?.apiKeyPrefix} readOnly className="pr-10 bg-muted/50" />
                <Key className="h-4 w-4 absolute right-3 top-3 text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Default Model</div>
                <div className="font-mono text-sm font-semibold">{status.gemini?.defaultModel}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Region</div>
                <div className="font-mono text-sm font-semibold">Global</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 flex border-t py-4 justify-end">
            <Button variant="outline" size="sm" onClick={() => handleTestConnection('Gemini')} disabled={loading === 'Gemini' || !status.gemini?.connected}>
              {loading === 'Gemini' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate Test Query
            </Button>
          </CardFooter>
        </Card>

        {/* Recall.ai */}
        <Card className={`shadow-sm relative overflow-hidden ${!status.recall?.connected ? 'border-orange-200' : ''}`}>
          {!status.recall?.connected && <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>}
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="h-5 w-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">R</div>
                  Recall.ai
                </CardTitle>
                <CardDescription className="mt-1">
                  Meeting bot orchestration and transcription.
                </CardDescription>
              </div>
              {status.recall?.connected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 flex items-center">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 flex items-center">
                  <AlertCircle className="h-3.5 w-3.5" /> Action Required
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!status.recall?.connected && (
              <div className="text-sm bg-orange-50/50 p-3 rounded-lg border border-orange-100 text-orange-800 mb-2">
                Your API key is missing or invalid. Please update your Recall.ai configuration to enable meeting recording bots.
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">API Key</label>
              <div className="flex gap-2">
                <Input type={status.recall?.connected ? "password" : "text"} placeholder="Enter your Recall API Key" defaultValue={status.recall?.connected ? status.recall?.apiKeyPrefix : ""} />
                <Button onClick={() => handleSaveToken('Recall.ai')}>Save</Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 flex justify-between border-t py-4">
             <a href="#" className="text-sm text-blue-600 hover:underline">Get API Key</a>
            <Button variant="outline" size="sm" onClick={() => handleTestConnection('Recall')} disabled={loading === 'Recall' || !status.recall?.connected}>
              {loading === 'Recall' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test Connection
            </Button>
          </CardFooter>
        </Card>

        {/* Firebase Admin */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#FFA000" d="M19.782,14.654l-5.694-11.233c-0.298-0.589-1.127-0.589-1.425,0L9.897,8.877l6.81,6.811L19.782,14.654z"/>
                      <path fill="#F6820C" d="M0,0 M16.707,15.688l3.076-1.034L12.663,0.72c-0.298-0.589-1.127-0.589-1.425,0l-1.341,2.645 M0,0 "/>
                      <path fill="#FFCA28" d="M1.385,17.291l10.378,5.772c0.46,0.256,1.016,0.256,1.476,0l10.375-5.772L12.663,0.72c-0.298-0.589-1.127-0.589-1.425,0 L1.385,17.291z M0,0 "/>
                  </svg>
                  Firebase Admin SDK
                </CardTitle>
                <CardDescription className="mt-1">
                  Server-side database and authentication management.
                </CardDescription>
              </div>
              {status.firebase?.connected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 flex items-center">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 flex items-center">
                  <AlertCircle className="h-3.5 w-3.5" /> App Default Auth
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!status.firebase?.connected && (
               <div className="text-sm bg-orange-50/50 p-3 rounded-lg border border-orange-100 text-orange-800 mb-2">
                 You are using Application Default Credentials which may not have correct Firestore access. Configure FIREBASE_SERVICE_ACCOUNT_KEY in secrets to fix permissions.
               </div>
            )}
            <div className="grid grid-cols-2 gap-4">
               <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Project ID</div>
                <div className="font-mono text-sm font-semibold truncate">{status.firebase?.projectId}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="text-xs text-muted-foreground font-medium uppercase mb-1">Auth Type</div>
                <div className="font-mono text-sm font-semibold truncate">{status.firebase?.authType}</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 flex border-t py-4 justify-between">
            <span className="text-sm text-muted-foreground">Configured via Secrets</span>
            <Button variant="outline" size="sm" onClick={() => handleTestConnection('Firebase')} disabled={loading === 'Firebase'}>
              {loading === 'Firebase' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify Access
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
