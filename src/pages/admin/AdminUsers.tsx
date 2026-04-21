import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);

  const fetchUsers = () => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => setUsers(data.users || []));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const changeRole = async (uid: string, role: string) => {
    try {
      await fetch(`/api/admin/users/${uid}`, {
         method: 'PATCH',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ role })
      });
      toast.success('Role updated');
      fetchUsers();
    } catch (e) {
      toast.error('Failed to update role');
    }
  };

  const toggleStatus = async (uid: string, disabled: boolean) => {
    try {
      await fetch(`/api/admin/users/${uid}`, {
         method: 'PATCH',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ disabled })
      });
      toast.success(disabled ? 'User suspended' : 'User reactivated');
      fetchUsers();
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Users</h1>
        <Button>Invite User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.uid}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{user.uid}</TableCell>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.displayName || '-'}</TableCell>
                  <TableCell>
                     <Select value={user.role} onValueChange={(val) => changeRole(user.uid, val)}>
                         <SelectTrigger className="w-32 h-8 text-xs">
                             <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                             <SelectItem value="member">Member</SelectItem>
                             <SelectItem value="teamLead">Team Lead</SelectItem>
                             <SelectItem value="orgAdmin">Org Admin</SelectItem>
                         </SelectContent>
                     </Select>
                  </TableCell>
                  <TableCell>
                      {user.disabled ? <Badge variant="destructive">Suspended</Badge> : <Badge className="bg-green-100 text-green-700">Active</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                     <Button variant="ghost" size="sm" onClick={() => toggleStatus(user.uid, !user.disabled)}>
                         {user.disabled ? 'Reactivate' : 'Suspend'}
                     </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
