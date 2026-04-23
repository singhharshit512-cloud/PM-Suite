import React, { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { MessageSquarePlus, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export function FeedbackButton({ adminEmail, className, variant, size }: { adminEmail?: string; className?: string; variant?: any; size?: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const location = useLocation();
  const authContext = useAuth();
  
  // Depending on where this is rendered, useAuth might be available or not (Admin Layout has no useAuth, it has useAdminAuth)
  const user = authContext?.user;

  let currentModule = "Dashboard";
  if (location.pathname.includes('/notes')) currentModule = "Notes";
  else if (location.pathname.includes('/tasks')) currentModule = "Tasks";
  else if (location.pathname.includes('/cowork')) currentModule = "Cowork";
  else if (location.pathname.includes('/admin')) currentModule = "Admin Console";

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // We downscale or limit to 1MB
    if (file.size > 1024 * 1024 * 1.5) { 
      toast.error('Image size must be less than 1.5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageBase64(null);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    
    const email = user?.email || adminEmail || "Anonymous";
    
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ module: currentModule, description, imageBase64, email })
      });
      if (!res.ok) {
         const errorText = await res.text();
         throw new Error(errorText);
      }
      
      toast.success('Feedback submitted successfully. Thank you!');
      setIsOpen(false);
      setDescription('');
      setImageBase64(null);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to submit feedback: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className={className || "fixed bottom-6 left-6 rounded-full shadow-lg gap-2 z-50 bg-blue-600 hover:bg-blue-700 text-white"}
        size={size || "lg"}
        variant={variant}
      >
        <MessageSquarePlus className="h-5 w-5 mr-2" />
        Give Feedback
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Give Feedback</DialogTitle>
            <DialogDescription>
              We'd love to hear your thoughts or bug reports.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="module">Module</Label>
              <Input
                id="module"
                value={currentModule}
                readOnly
                className="bg-gray-50 text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Feedback Description</Label>
              <Textarea
                id="description"
                placeholder="Tell us what's working well or what could be improved..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Attachment (Optional)</Label>
              {imageBase64 ? (
                <div className="relative inline-block border rounded-md p-1 bg-gray-50">
                  <img src={imageBase64} alt="Attachment preview" className="max-h-32 object-contain rounded" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={removeImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label htmlFor="image-upload" className="cursor-pointer flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-900 transition flex-col gap-2 h-24 text-gray-500">
                    <ImageIcon className="h-6 w-6 text-gray-400" />
                    <span className="text-xs font-medium">Click to upload image</span>
                  </Label>
                  <Input 
                    id="image-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleImageUpload}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !description.trim()}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
