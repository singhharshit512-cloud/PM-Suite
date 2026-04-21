import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

export function AdminAudit() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin/audit')
      .then(res => res.json())
      .then(data => setLogs(data.logs || []));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Audit Log</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Admin ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm font-medium">{new Date(log.timestamp).toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-gray-500 font-mono">{log.adminId}</TableCell>
                  <TableCell>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-800 font-medium">
                          {log.action}
                      </span>
                  </TableCell>
                  <TableCell className="text-sm">{log.target}</TableCell>
                  <TableCell className="text-sm text-gray-500 font-mono">{log.ip}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
