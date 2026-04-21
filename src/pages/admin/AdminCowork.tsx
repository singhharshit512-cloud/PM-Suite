import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Input } from '../../components/ui/input';
import { Slider } from '../../components/ui/slider';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';

export function AdminCowork() {
  const [config, setConfig] = useState<any>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config/cowork')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setDraftPrompt(data.prompt);
      });
  }, []);

  const savePrompt = async () => {
    try {
      await fetch('/api/admin/config/cowork/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: draftPrompt })
      });
      toast.success('System Prompt Saved & Published');
      // refresh
      const res = await fetch('/api/admin/config/cowork');
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      toast.error('Failed to save prompt');
    }
  };

  const saveModelSettings = async () => {
    try {
       await fetch('/api/admin/config/model', {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(config.modelSettings)
       });
       toast.success('Model Settings Saved');
    } catch (e) {
       toast.error('Failed to save settings');
    }
  };

  const runTest = async () => {
      if (!testMessage) return;
      setIsTesting(true);
      try {
          const res = await fetch('/api/admin/cowork/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: draftPrompt, message: testMessage })
          });
          const data = await res.json();
          setTestResponse(data.text);
      } catch (e) {
          toast.error("Test failed");
      } finally {
          setIsTesting(false);
      }
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Cowork AI Configuration</h1>
      </div>

      <Tabs defaultValue="prompt" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="templates">Document Templates</TabsTrigger>
          <TabsTrigger value="model">Model Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="py-4 border-b border-gray-100 flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">System Prompt Editor</CardTitle>
                            <div className="flex gap-2">
                                <Button variant={testMode ? "secondary" : "outline"} size="sm" onClick={() => setTestMode(!testMode)}>
                                    {testMode ? 'Exit Test Mode' : 'Enter Test Mode'}
                                </Button>
                                <Button size="sm" onClick={savePrompt}>Save & Publish</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Textarea 
                               className="min-h-[500px] font-mono text-sm border-0 focus-visible:ring-0 rounded-none resize-y p-4"
                               value={draftPrompt}
                               onChange={(e) => setDraftPrompt(e.target.value)}
                               placeholder="You are Cowork, an intelligent document agent..."
                            />
                        </CardContent>
                    </Card>

                    {testMode && (
                        <Card className="border-blue-200 shadow-sm">
                            <CardHeader className="bg-blue-50 py-3 border-b border-blue-100">
                                <CardTitle className="text-sm text-blue-800">Test Draft Prompt</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                               <div className="flex gap-2">
                                   <Input 
                                      placeholder="Ask Cowork something..." 
                                      value={testMessage}
                                      onChange={(e) => setTestMessage(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && runTest()}
                                   />
                                   <Button onClick={runTest} disabled={isTesting}>Send</Button>
                               </div>
                               {testResponse && (
                                   <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                       <p className="font-medium text-xs text-gray-500 mb-2">RESPONSE:</p>
                                       <pre className="whitespace-pre-wrap text-sm font-sans">{testResponse}</pre>
                                   </div>
                               )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader className="py-4 border-b border-gray-100">
                            <CardTitle className="text-base">Version History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 divide-y divide-gray-100">
                            {config.promptVersions.map((v: any, i: number) => (
                                <div key={i} className="p-4 flex items-start justify-between hover:bg-gray-50">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{new Date(v.savedAt).toLocaleString()}</p>
                                        <p className="text-xs text-gray-500">{v.savedBy}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setDraftPrompt(v.prompt)}>Restore</Button>
                                </div>
                            ))}
                            {config.promptVersions.length === 0 && (
                                <div className="p-4 text-center text-sm text-gray-500">No previous versions</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </TabsContent>

        <TabsContent value="templates">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Document Templates</CardTitle>
                    <Button size="sm">Add Template</Button>
                </CardHeader>
                <CardContent>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {config.templates.map((t: any) => (
                           <Card key={t.id} className="border border-gray-200">
                               <CardHeader className="py-3">
                                   <CardTitle className="text-base">{t.name}</CardTitle>
                               </CardHeader>
                               <CardContent>
                                   <p className="text-sm text-gray-500 mb-4 line-clamp-2">{t.description}</p>
                                   <div className="bg-gray-50 p-2 rounded text-xs font-mono line-clamp-3 text-gray-400">
                                       {t.body}
                                   </div>
                                   <div className="flex gap-2 mt-4">
                                       <Button variant="outline" size="sm">Edit</Button>
                                       <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600">Delete</Button>
                                   </div>
                               </CardContent>
                           </Card>
                       ))}
                       {config.templates.length === 0 && (
                           <div className="col-span-full text-center py-12 text-gray-500">
                               No templates configured.
                           </div>
                       )}
                   </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="model">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Generation Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <label className="text-sm font-medium">Temperature</label>
                                <span className="text-sm text-gray-500">{config.modelSettings.temperature}</span>
                            </div>
                            <Slider 
                               value={[config.modelSettings.temperature * 100]} 
                               max={100} 
                               step={1} 
                               onValueChange={v => setConfig({...config, modelSettings: {...config.modelSettings, temperature: v[0]/100}})} 
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <label className="text-sm font-medium">Max Output Tokens</label>
                                <span className="text-sm text-gray-500">{config.modelSettings.maxTokens}</span>
                            </div>
                            <Slider 
                               value={[config.modelSettings.maxTokens]} 
                               max={8192} 
                               step={100} 
                               onValueChange={v => setConfig({...config, modelSettings: {...config.modelSettings, maxTokens: v[0]}})} 
                            />
                        </div>
                        <Button onClick={saveModelSettings}>Save Settings</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Usage Controls</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-sm font-medium">Daily Quota Per User (Messages)</label>
                           <Input 
                              type="number" 
                              value={config.modelSettings.dailyQuotaPerUser} 
                              onChange={e => setConfig({...config, modelSettings: {...config.modelSettings, dailyQuotaPerUser: parseInt(e.target.value)}})} 
                           />
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                            <div>
                               <p className="text-sm font-medium">Global Reset</p>
                               <p className="text-xs text-gray-500">Reset all user quotas immediately</p>
                            </div>
                            <Button variant="destructive" size="sm">Reset All Quotas</Button>
                        </div>
                        <Button onClick={saveModelSettings}>Save Controls</Button>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
