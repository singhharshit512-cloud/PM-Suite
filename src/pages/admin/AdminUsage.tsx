import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AdminUsage() {
  const [usageData, setUsageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/system/usage')
      .then(res => res.json())
      .then(data => {
        setUsageData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
        toast.error('Failed to load usage data');
      });
  }, []);

  if (loading || !usageData) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usage & Billing</h1>
        <p className="text-muted-foreground mt-2">
          Monitor your platform usage and estimated costs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total AI Messages (30d)</CardDescription>
            <CardTitle className="text-3xl">{usageData.metrics.totalMessages.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">Estimated cost: ${(usageData.metrics.totalMessages * 0.005).toFixed(4)}</div>
            <div className="text-xs text-green-600 font-medium mt-1">Live Database Aggregate</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bot Meeting Sessions</CardDescription>
            <CardTitle className="text-3xl">{usageData.metrics.totalMeetings.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-xs text-muted-foreground">Across all organizations</div>
             <div className="text-xs text-blue-600 font-medium mt-1">Live Database Aggregate</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Users</CardDescription>
            <CardTitle className="text-3xl">{usageData.metrics.activeUsers}</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-xs text-muted-foreground">With assigned roles</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gemini API Message Usage Activity</CardTitle>
          <CardDescription>Token and message estimations based on system capacity</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={usageData.tokenData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="input" name="Input Tokens" stroke="#8884d8" fillOpacity={1} fill="url(#colorInput)" />
              <Area type="monotone" dataKey="output" name="Output Tokens" stroke="#82ca9d" fillOpacity={1} fill="url(#colorOutput)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recall.ai Meeting Metrics</CardTitle>
          <CardDescription>Bot sessions correlated to active platform configurations</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={usageData.meetingData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'transparent' }} />
              <Legend />
              <Bar dataKey="duration" name="Session Metric" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
