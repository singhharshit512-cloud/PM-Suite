import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Loader2, Download, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

export function AdminFeedback() {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fetchFeedback = async () => {
    try {
      const res = await fetch('/api/admin/feedback');
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch (e) {
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleExport = () => {
    window.location.href = '/api/admin/feedback/export';
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">User Feedback</h1>
          <p className="text-muted-foreground mt-2">View and export feedback submitted from apps.</p>
        </div>
        <Button onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" /> 
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User Email</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Attachment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feedback.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}
                  </TableCell>
                  <TableCell className="font-medium">{item.userEmail}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-700">
                      {item.module}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap text-sm text-gray-800">
                    {item.description}
                  </TableCell>
                  <TableCell>
                    {item.imageBase64 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedImage(item.imageBase64)}>
                        <ImageIcon className="h-4 w-4 mr-2" /> View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {feedback.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    No feedback received yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Attachment Preview</DialogTitle>
          </DialogHeader>
          {selectedImage && (
             <img src={selectedImage} alt="Feedback Attachment" className="w-full h-auto rounded-md object-contain max-h-[70vh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
