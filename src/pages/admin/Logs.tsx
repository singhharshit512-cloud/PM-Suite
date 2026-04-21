import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Download, AlertTriangle, Pause, Play, ChevronDown, ChevronRight, Activity, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [errorSpikeAlert, setErrorSpikeAlert] = useState(false);
  
  const [filters, setFilters] = useState({
    search: '',
    level: 'all',
    module: 'all',
    userEmail: 'all',
    method: 'all',
    startDate: '',
    endDate: ''
  });
  
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]); // To go back
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchLogs = async (currentCursor: string | null = null, overrideFilters: any = null) => {
    try {
      setLoading(true);
      const currentFilters = overrideFilters || filters;
      const params = new URLSearchParams();
      if (currentFilters.level !== 'all') params.append('level', currentFilters.level);
      if (currentFilters.module !== 'all') params.append('module', currentFilters.module);
      if (currentFilters.startDate) params.append('startDate', currentFilters.startDate);
      if (currentFilters.endDate) params.append('endDate', currentFilters.endDate);
      if (currentCursor) params.append('cursor', currentCursor);
      
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      
      // Client side filtering for search
      let filteredLogs = data.logs;
      if (currentFilters.search) {
         const q = currentFilters.search.toLowerCase();
         filteredLogs = filteredLogs.filter((l: any) => 
            (l.responseSummary && l.responseSummary.toLowerCase().includes(q)) ||
            (l.requestSummary && l.requestSummary.toLowerCase().includes(q)) ||
            (l.route && l.route.toLowerCase().includes(q)) ||
            (l.userEmail && l.userEmail.toLowerCase().includes(q)) ||
            (l.traceId && l.traceId.toLowerCase().includes(q))
         );
      }
      if (currentFilters.method !== 'all') {
         filteredLogs = filteredLogs.filter((l: any) => l.method === currentFilters.method);
      }
      if (currentFilters.userEmail !== 'all') {
         filteredLogs = filteredLogs.filter((l: any) => l.userEmail === currentFilters.userEmail);
      }
      
      setLogs(filteredLogs);
      if (data.nextCursor && !currentCursor) {
        setCursor(data.nextCursor);
      } else if (data.nextCursor) {
        setCursor(data.nextCursor);
      } else {
        setCursor(null);
      }
    } catch (e) {
      toast.error('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/logs/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        if (data.errorSpike) {
           setErrorSpikeAlert(true);
        }
      }
    } catch(e) {}
  };

  const fetchHealth = async () => {
    try {
       const res = await fetch('/api/admin/health');
       if (res.ok) setHealth(await res.json());
    } catch(e) {}
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
    fetchHealth();
  }, []);

  // Pollers
  useEffect(() => {
    let interval: any;
    if (liveMode) {
      interval = setInterval(() => {
         fetchLogs(); // In a real app we'd prepend new logs, but for simplicity we reload page 1
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [liveMode, filters]);

  useEffect(() => {
    const statsInterval = setInterval(() => {
      fetchStats();
      fetchHealth();
    }, 30000);
    return () => clearInterval(statsInterval);
  }, []);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filters.level !== 'all') params.append('level', filters.level);
    if (filters.module !== 'all') params.append('module', filters.module);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    window.location.href = `/api/admin/logs/export?${params.toString()}`;
  };

  const dismissAlert = () => {
    setErrorSpikeAlert(false);
  };

  return (
    <div className="w-full flex w-full flex-col font-sans p-6 space-y-6">
      
      {/* Alert Strip */}
      {errorSpikeAlert && (
        <div className="bg-red-500 text-white px-4 py-3 rounded-md flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-3" />
            <span className="font-semibold mr-2">High Error Rate Detected!</span> 
            <span>Over 10 errors occurred in the last 5 minutes. Check route statistics.</span>
          </div>
          <div className="flex space-x-3 gap-2">
            <Button size="sm" variant="secondary" className="bg-white text-red-600 hover:bg-gray-100" onClick={() => {
                setFilters({...filters, level: 'ERROR'});
                fetchLogs();
            }}>Investigate</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-red-600 hover:text-white" onClick={dismissAlert}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-4">
         <div>
            <h1 className="text-2xl font-bold tracking-tight">Platform Logs</h1>
            <div className="flex items-center mt-1 text-sm text-muted-foreground">
               {liveMode ? (
                  <span className="flex items-center text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse mr-2" />
                    Live log stream
                  </span>
               ) : (
                  <span className="flex items-center text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-gray-400 mr-2" />
                    Paused
                  </span>
               )}
               <span className="mx-2">•</span>
               <span>{stats?.totalToday || 0} entries today</span>
            </div>
         </div>
         <div className="flex space-x-2">
             <Button variant="outline" size="sm" onClick={() => setLiveMode(!liveMode)}>
                {liveMode ? <><Pause className="h-4 w-4 mr-2" /> Pause live</> : <><Play className="h-4 w-4 mr-2" /> Resume live</>}
             </Button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
         {/* Main content takes 3 cols */}
         <div className="lg:col-span-3 space-y-6">
            
            {/* Filter Bar */}
            <div className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end border">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-semibold mb-1 block text-gray-600">Search</label>
                <Input placeholder="Search messages, route, traceId..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className="bg-white" />
              </div>
              <div className="w-32">
                <label className="text-xs font-semibold mb-1 block text-gray-600">Level</label>
                <Select value={filters.level} onValueChange={v => setFilters({...filters, level: v})}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="INFO">INFO</SelectItem>
                    <SelectItem value="WARN">WARN</SelectItem>
                    <SelectItem value="ERROR">ERROR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <label className="text-xs font-semibold mb-1 block text-gray-600">Module</label>
                <Select value={filters.module} onValueChange={v => setFilters({...filters, module: v})}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="auth">auth</SelectItem>
                    <SelectItem value="cowork">cowork</SelectItem>
                    <SelectItem value="drive">drive</SelectItem>
                    <SelectItem value="calendar">calendar</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button variant="secondary" onClick={() => fetchLogs()}><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`} /></Button>
              <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 flex flex-col justify-center items-center">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Today</div>
                  <div className="text-2xl font-bold mt-1">{stats?.totalToday || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col justify-center items-center">
                  <div className="text-xs font-medium text-red-600 uppercase tracking-wider">Errors</div>
                  <div className="text-2xl font-bold mt-1 text-red-600">{stats?.errorsToday || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col justify-center items-center">
                  <div className="text-xs font-medium text-amber-600 uppercase tracking-wider">Warnings</div>
                  <div className="text-2xl font-bold mt-1 text-amber-600">{stats?.warningsToday || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex flex-col justify-center items-center">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Latency</div>
                  <div className="text-2xl font-bold mt-1">
                    {stats?.routeStats ? Math.round(stats.routeStats.reduce((a:any,b:any)=>a+b.p50,0)/stats.routeStats.length) : 0}ms
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Log Table */}
            <div className="border rounded-lg overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="w-40">Timestamp</TableHead>
                    <TableHead className="w-24">Level</TableHead>
                    <TableHead className="w-24">Module</TableHead>
                    <TableHead className="w-40">User</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-20 text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log, idx) => (
                    <React.Fragment key={log.id}>
                      <TableRow 
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${log.level==='ERROR'?'bg-red-50/30':''}`}
                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                      >
                        <TableCell className="font-mono text-xs whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</TableCell>
                        <TableCell>
                           <Badge variant={log.level === 'ERROR' ? 'destructive' : log.level === 'WARN' ? 'secondary' : 'outline'} className={log.level==='WARN'?'bg-amber-100 text-amber-700':''}>
                             {log.level}
                           </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{log.module}</TableCell>
                        <TableCell className="text-sm truncate max-w-[150px]" title={log.userId}>
                            {log.userEmail && <div className="font-medium text-gray-900">{log.userEmail}</div>}
                            {log.userId && <div className="font-mono text-xs text-muted-foreground">{log.userId}</div>}
                            {!log.userEmail && !log.userId && 'Anonymous'}
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-sm" title={log.responseSummary || log.requestSummary}>
                           <span className="font-semibold text-gray-700 mr-2">{log.method} {log.route}</span>
                           <span className="text-gray-500">{log.responseSummary || log.requestSummary || 'No details'}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">{log.latencyMs}ms</TableCell>
                      </TableRow>
                      {expandedRow === log.id && (
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          <TableCell colSpan={6} className="p-0 border-b">
                            <div className="p-6 text-sm border-t border-gray-100 shadow-inner">
                               <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div><span className="font-semibold text-gray-500 w-24 inline-block">Trace ID:</span> <span className="font-mono">{log.traceId}</span></div>
                                  <div><span className="font-semibold text-gray-500 w-24 inline-block">IP:</span> <span className="font-mono">{log.ip}</span></div>
                                  <div><span className="font-semibold text-gray-500 w-24 inline-block">User ID:</span> {log.userId || 'Anonymous'}</div>
                                  <div><span className="font-semibold text-gray-500 w-24 inline-block">Status:</span> {log.statusCode}</div>
                               </div>
                               
                               <div className="mb-4">
                                  <div className="font-semibold text-gray-500 mb-1">Request Summary:</div>
                                  <div className="bg-white border rounded p-2 text-xs font-mono text-gray-700">{log.requestSummary || 'None'}</div>
                               </div>

                               {log.stackTrace && (
                                 <div className="mb-4">
                                    <div className="font-semibold text-red-500 mb-1">Stack Trace:</div>
                                    <pre className="bg-gray-900 border-l-4 border-red-500 text-red-400 p-4 rounded text-xs overflow-x-auto whitespace-pre-wrap">{log.stackTrace}</pre>
                                 </div>
                               )}
                               
                               <div className="flex gap-4 mt-4">
                                 <Button variant="outline" size="sm" onClick={(e) => {
                                    e.stopPropagation();
                                    const newFilters = {...filters, search: log.traceId};
                                    setFilters(newFilters);
                                    fetchLogs(null, newFilters);
                                 }}>View full trace</Button>
                               </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                  {logs.length === 0 && !loading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-500">No logs found matching filters.</TableCell></TableRow>
                  )}
                  {loading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              
              <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                 <div className="text-sm text-gray-500">Showing page</div>
                 <div>
                    <Button variant="outline" size="sm" onClick={() => fetchLogs()} disabled={!cursor}>Next Page <ChevronRight className="h-4 w-4 ml-1"/></Button>
                 </div>
              </div>
            </div>

         </div>

         {/* Sidebar Content */}
         <div className="space-y-6">
            
            {/* Sparkbar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">24h Error Frequency</CardTitle>
              </CardHeader>
              <CardContent>
                 <div className="flex items-end h-24 gap-1 mt-2">
                    {stats?.sparkbar ? stats.sparkbar.map((count: number, i: number) => {
                       const max = Math.max(...stats.sparkbar, 10);
                       const height = Math.max((count / max) * 100, count > 0 ? 10 : 2);
                       const color = count === 0 ? 'bg-gray-200' : count < 10 ? 'bg-amber-400' : 'bg-red-500';
                       return (
                         <div key={i} className="flex-1 flex flex-col justify-end group relative">
                            <div className={`w-full rounded-t-sm ${color} transition-all duration-300 ease-in-out`} style={{ height: `${height}%` }}></div>
                            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                               {count} errors ({23 - i}h ago)
                            </div>
                         </div>
                       )
                    }) : (
                       <div className="w-full h-full flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-gray-300" /></div>
                    )}
                 </div>
                 <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>24h ago</span>
                    <span>Now</span>
                 </div>
              </CardContent>
            </Card>

            {/* Performance Sub-panel */}
            <Card>
               <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center"><Activity className="h-4 w-4 mr-2 text-blue-500" /> Endpoint Latencies</CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  <div className="max-h-[300px] overflow-y-auto">
                     <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 border-y sticky top-0">
                           <tr>
                              <th className="py-2 px-4 font-semibold text-gray-500">Route</th>
                              <th className="py-2 px-2 font-semibold text-gray-500">P50</th>
                              <th className="py-2 px-2 font-semibold text-gray-500">P99</th>
                           </tr>
                        </thead>
                        <tbody>
                           {stats?.routeStats?.slice(0, 15).map((rs: any, idx: number) => (
                              <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                 <td className="py-2 px-4 font-mono truncate max-w-[120px]" title={rs.route}>{rs.route}</td>
                                 <td className="py-2 px-2">{rs.p50}ms</td>
                                 <td className={`py-2 px-2 font-semibold ${rs.p99 > 1000 ? 'text-red-500' : rs.p99 > 500 ? 'text-amber-500' : 'text-green-500'}`}>{rs.p99}ms</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </CardContent>
            </Card>

            {/* Health Status */}
            <div>
               <h3 className="text-sm font-semibold text-gray-900 mb-3 px-1">Dependency Health</h3>
               <div className="grid grid-cols-2 gap-3">
                  {[
                     { name: 'Gemini API', key: 'gemini' },
                     { name: 'Recall.ai', key: 'recall' },
                     { name: 'Google API', key: 'google' },
                     { name: 'Firestore', key: 'firestore' }
                  ].map(dep => {
                     const h = health?.[dep.key];
                     const isUp = h?.status === 'healthy';
                     return (
                        <div key={dep.key} className="bg-white border rounded-lg p-3 text-sm flex flex-col justify-between align-start shadow-sm">
                           <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-700">{dep.name}</span>
                              {isUp ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Loader2 className="h-4 w-4 animate-spin text-gray-300" />}
                           </div>
                           <div className="text-xs text-gray-500">
                              {h ? `${h.avgLatency}ms avg` : 'Loading...'}
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}
