import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, setDoc, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Meeting, Note, ActionItem } from '../lib/types';
import { fetchUpcomingMeetings } from '../lib/calendar';
import { generateActionItems } from '../lib/gemini';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { RichTextEditor } from '../components/RichTextEditor';
import { Search, Plus, Calendar as CalendarIcon, Users, Sparkles, Check, Trash2, ArrowRight, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export function Notes() {
  const { user, hasCalendarAccess, connectCalendar, clearCalendarAccess, syncTrigger } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isNewMeetingModalOpen, setIsNewMeetingModalOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newMeetingTime, setNewMeetingTime] = useState(format(new Date(), 'HH:mm'));
  
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const [aiPersonName, setAiPersonName] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteMeetingDialogOpen, setIsDeleteMeetingDialogOpen] = useState(false);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noteContentRef = useRef(noteContent);
  const currentNoteRef = useRef(currentNote);
  const selectedMeetingIdRef = useRef(selectedMeetingId);

  useEffect(() => {
    noteContentRef.current = noteContent;
    currentNoteRef.current = currentNote;
    selectedMeetingIdRef.current = selectedMeetingId;
  }, [noteContent, currentNote, selectedMeetingId]);

  // Save on unmount if there are pending changes
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current && user && selectedMeetingIdRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const contentToSave = noteContentRef.current;
        const meetingId = selectedMeetingIdRef.current;
        const note = currentNoteRef.current;
        
        if (note) {
          updateDoc(doc(db, 'notes', note.id), {
            content: contentToSave,
            updatedAt: serverTimestamp()
          }).catch(console.error);
        } else {
          addDoc(collection(db, 'notes'), {
            userId: user.uid,
            meetingId: meetingId,
            content: contentToSave,
            actionItems: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }).catch(console.error);
        }
      }
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'meetings'), where('userId', '==', user.uid), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMeetings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Meeting)));
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (user && hasCalendarAccess) {
      fetchUpcomingMeetings(user.uid)
        .then(data => setCalendarEvents(data.items || []))
        .catch((error) => {
          if (error.message === 'UNAUTHORIZED') {
            clearCalendarAccess();
            toast.error('Calendar access expired. Please reconnect.');
          } else {
            console.error(error);
          }
        });
    }
  }, [user, hasCalendarAccess, syncTrigger]);

  useEffect(() => {
    if (!selectedMeetingId || !user) {
      setCurrentNote(null);
      setNoteContent('');
      return;
    }

    const q = query(collection(db, 'notes'), where('meetingId', '==', selectedMeetingId), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const noteDoc = snapshot.docs[0];
        const noteData = { id: noteDoc.id, ...noteDoc.data() } as Note;
        setCurrentNote(noteData);
        // Only update content if we're not currently typing (to avoid cursor jumps)
        // In a real app, we'd use a more robust sync mechanism. For now, we'll just set it initially.
        if (!currentNote) {
          setNoteContent(noteData.content);
        }
      } else {
        setCurrentNote(null);
        setNoteContent('');
      }
    });

    return () => unsub();
  }, [selectedMeetingId, user]);

  const handleNoteChange = (newContent: string) => {
    setNoteContent(newContent);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(() => {
      saveNote(newContent);
    }, 2000);
  };

  const handleBlur = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      saveNote(noteContent);
    }
  };

  const handleDeleteNote = async () => {
    if (!currentNote) return;
    try {
      await deleteDoc(doc(db, 'notes', currentNote.id));
      setCurrentNote(null);
      setNoteContent('');
      setIsDeleteDialogOpen(false);
      toast.success('Note deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete note');
    }
  };

  const handleDeleteMeeting = async () => {
    if (!selectedMeetingId) return;
    try {
      await deleteDoc(doc(db, 'meetings', selectedMeetingId));
      if (currentNote) {
        await deleteDoc(doc(db, 'notes', currentNote.id));
      }
      setSelectedMeetingId(null);
      setCurrentNote(null);
      setNoteContent('');
      setIsDeleteMeetingDialogOpen(false);
      toast.success('Meeting deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete meeting');
    }
  };

  const saveNote = async (contentToSave: string) => {
    if (!user || !selectedMeetingId) return;

    try {
      if (currentNote) {
        await updateDoc(doc(db, 'notes', currentNote.id), {
          content: contentToSave,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'notes'), {
          userId: user.uid,
          meetingId: selectedMeetingId,
          content: contentToSave,
          actionItems: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save note', error);
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOfflineMeeting = async () => {
    if (!user || !newMeetingTitle.trim()) return;

    try {
      const docRef = await addDoc(collection(db, 'meetings'), {
        userId: user.uid,
        title: newMeetingTitle,
        date: new Date(newMeetingDate),
        startTime: newMeetingTime,
        endTime: '',
        googleEventId: null,
        participants: [],
        isOffline: true,
        createdAt: serverTimestamp()
      });
      
      setIsNewMeetingModalOpen(false);
      setNewMeetingTitle('');
      setSelectedMeetingId(docRef.id);
      toast.success('Meeting created');
    } catch (error) {
      console.error(error);
      toast.error('Failed to create meeting');
    }
  };

  const handleTakeNotesForCalendarEvent = async (event: any) => {
    if (!user) return;

    // Check if we already have a meeting for this event
    const existingMeeting = meetings.find(m => m.googleEventId === event.id);
    if (existingMeeting) {
      setSelectedMeetingId(existingMeeting.id);
      return;
    }

    // Create a new meeting from the calendar event
    try {
      const participants = event.attendees ? event.attendees.map((a: any) => ({
        name: a.displayName || a.email.split('@')[0],
        email: a.email
      })) : [];

      const docRef = await addDoc(collection(db, 'meetings'), {
        userId: user.uid,
        title: event.summary || 'Untitled Meeting',
        date: new Date(event.start.dateTime || event.start.date),
        startTime: format(new Date(event.start.dateTime || event.start.date), 'h:mm a'),
        endTime: event.end ? format(new Date(event.end.dateTime || event.end.date), 'h:mm a') : '',
        googleEventId: event.id,
        participants,
        isOffline: false,
        createdAt: serverTimestamp()
      });
      
      setSelectedMeetingId(docRef.id);
    } catch (error) {
      console.error(error);
      toast.error('Failed to initialize meeting notes');
    }
  };

  const handleGenerateActionItems = async () => {
    if (!user || !currentNote || !selectedMeetingId || !aiPersonName.trim()) return;

    const meeting = meetings.find(m => m.id === selectedMeetingId);
    if (!meeting) return;

    setIsGeneratingAi(true);
    try {
      const participantNames = meeting.participants.map(p => p.name).join(', ');
      const newItems = await generateActionItems(
        meeting.title,
        format(meeting.date.toDate(), 'yyyy-MM-dd'),
        participantNames,
        noteContent,
        aiPersonName
      );

      if (newItems && newItems.length > 0) {
        const formattedItems: ActionItem[] = newItems.map((item: any) => ({
          id: Math.random().toString(36).substring(2, 9),
          personName: aiPersonName,
          description: item.description,
          movedToTasks: false,
          taskId: null
        }));

        await updateDoc(doc(db, 'notes', currentNote.id), {
          actionItems: [...(currentNote.actionItems || []), ...formattedItems],
          updatedAt: serverTimestamp()
        });
        toast.success(`Generated ${formattedItems.length} action items`);
      } else {
        toast.info('No action items found for this person in the notes.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate action items');
    } finally {
      setIsGeneratingAi(false);
      setAiPersonName('');
    }
  };

  const handleMoveToActionItem = async (actionItem: ActionItem) => {
    if (!user || !currentNote || !selectedMeetingId) return;
    const meeting = meetings.find(m => m.id === selectedMeetingId);

    try {
      // Create task
      const taskRef = await addDoc(collection(db, 'tasks'), {
        userId: user.uid,
        title: actionItem.description,
        description: `From meeting: ${meeting?.title} on ${format(meeting?.date.toDate() || new Date(), 'MMM d, yyyy')}\nAssigned to: ${actionItem.personName}`,
        dueDate: null,
        status: 'open',
        closedAt: null,
        closedComment: null,
        createdAt: serverTimestamp(),
        sourceType: 'actionItem',
        sourceNoteId: currentNote.id,
        sourceActionItemId: actionItem.id
      });

      // Update action item
      const updatedActionItems = currentNote.actionItems.map(item => 
        item.id === actionItem.id ? { ...item, movedToTasks: true, taskId: taskRef.id } : item
      );

      await updateDoc(doc(db, 'notes', currentNote.id), {
        actionItems: updatedActionItems,
        updatedAt: serverTimestamp()
      });

      toast.success('Task created', {
        action: {
          label: 'View Tasks',
          onClick: () => navigate('/tasks')
        }
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to move to tasks');
    }
  };

  const handleDeleteActionItem = async (actionItemId: string) => {
    if (!currentNote) return;
    try {
      const updatedActionItems = currentNote.actionItems.filter(item => item.id !== actionItemId);
      await updateDoc(doc(db, 'notes', currentNote.id), {
        actionItems: updatedActionItems,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete action item');
    }
  };

  // Combine and filter meetings/events for the sidebar
  const getSidebarItems = () => {
    const items: any[] = [];
    
    // Add Firestore meetings
    meetings.forEach(m => {
      if (m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          m.participants.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))) {
        items.push({ type: 'meeting', data: m, date: m.date.toDate() });
      }
    });

    // Add Calendar events that don't have a corresponding meeting yet
    calendarEvents.forEach(e => {
      const eventDate = new Date(e.start.dateTime || e.start.date);
      if (!meetings.some(m => m.googleEventId === e.id)) {
        if (e.summary?.toLowerCase().includes(searchQuery.toLowerCase())) {
          items.push({ type: 'event', data: e, date: eventDate });
        }
      }
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const today: any[] = [];
    const upcoming: any[] = [];
    const past: Record<string, any[]> = {};

    items.forEach(item => {
      if (item.date >= startOfToday && item.date <= endOfToday) {
        today.push(item);
      } else if (item.date > endOfToday) {
        upcoming.push(item);
      } else {
        let dateStr = isYesterday(item.date) ? 'Yesterday' : format(item.date, 'MMM d, yyyy');
        if (!past[dateStr]) past[dateStr] = [];
        past[dateStr].push(item);
      }
    });

    // Sort today and upcoming (earliest first)
    today.sort((a, b) => a.date.getTime() - b.date.getTime());
    upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Sort past groups descending
    const sortedPastKeys = Object.keys(past).sort((a, b) => {
      if (a === 'Yesterday') return -1;
      if (b === 'Yesterday') return 1;
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return { today, upcoming, past, sortedPastKeys };
  };

  const { today, upcoming, past, sortedPastKeys } = getSidebarItems();
  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId);

  const renderSidebarItem = (item: any) => {
    if (item.type === 'meeting') {
      const m = item.data as Meeting;
      const isSelected = m.id === selectedMeetingId;
      return (
        <div
          key={m.id}
          onClick={() => setSelectedMeetingId(m.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedMeetingId(m.id);
            }
          }}
          className={`w-full text-left px-3 py-3 rounded-md transition-colors cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'}`}
        >
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{m.title}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">{m.startTime || format(m.date.toDate(), 'h:mm a')}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {m.isOffline ? 'Offline' : 'Calendar'}
              </Badge>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMeetingId(m.id);
                  setIsDeleteMeetingDialogOpen(true);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      );
    } else {
      const e = item.data;
      return (
        <div key={e.id} className="w-full text-left px-3 py-3 rounded-md border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{e.summary || 'Untitled'}</div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(e.start.dateTime || e.start.date), 'h:mm a')}</span>
            <Button size="sm" variant="secondary" className="h-6 text-xs px-2" onClick={() => handleTakeNotesForCalendarEvent(e)}>
              Take Notes
            </Button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Left Sidebar - Meeting List */}
      <div 
        className={`border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out relative ${
          isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden opacity-0'
        }`}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Meetings</h2>
            <Dialog open={isNewMeetingModalOpen} onOpenChange={setIsNewMeetingModalOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Plus className="h-4 w-4 mr-1" /> New
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Offline Meeting</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={newMeetingTitle} onChange={e => setNewMeetingTitle(e.target.value)} placeholder="Meeting title" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={newMeetingDate} onChange={e => setNewMeetingDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input type="time" value={newMeetingTime} onChange={e => setNewMeetingTime(e.target.value)} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNewMeetingModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateOfflineMeeting} disabled={!newMeetingTitle.trim()}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              placeholder="Search meetings..." 
              className="pl-9" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-6">
          {!hasCalendarAccess && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50 mb-4 text-center">
              <CalendarIcon className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Connect Calendar</h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">Sync your Google Calendar to take notes for upcoming meetings.</p>
              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={connectCalendar}>
                Connect Google Calendar
              </Button>
            </div>
          )}
          
          {today.length === 0 && upcoming.length === 0 && sortedPastKeys.length === 0 ? (
            <div className="text-center p-4 text-gray-500 text-sm">No meetings found.</div>
          ) : (
            <>
              {today.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 px-2">Today</h3>
                  <div className="space-y-1">
                    {today.map(renderSidebarItem)}
                  </div>
                </div>
              )}
              
              {upcoming.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Upcoming</h3>
                  <div className="space-y-1">
                    {upcoming.map(renderSidebarItem)}
                  </div>
                </div>
              )}

              {sortedPastKeys.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 px-2">Past Notes</h3>
                  <div className="space-y-6">
                    {sortedPastKeys.map(dateGroup => (
                      <div key={dateGroup}>
                        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2">{dateGroup}</h4>
                        <div className="space-y-1">
                          {past[dateGroup].map(renderSidebarItem)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Hide Sidebar Button */}
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => setIsSidebarOpen(false)} 
          className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-white dark:bg-gray-900 shadow-md border border-gray-200 dark:border-gray-800 z-20 hidden md:flex"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-950 flex flex-col overflow-hidden relative">
        {!isSidebarOpen && (
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setIsSidebarOpen(true)} 
            className="absolute left-4 top-6 h-8 w-8 rounded-full bg-white dark:bg-gray-900 shadow-md border border-gray-200 dark:border-gray-800 z-20 hidden md:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {selectedMeeting ? (
          <>
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-8 py-6 flex-shrink-0">
              <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedMeeting.title}</h1>
                    <div className="flex items-center mt-2 text-sm text-gray-500 dark:text-gray-400 space-x-4">
                      <span className="flex items-center"><CalendarIcon className="h-4 w-4 mr-1" /> {format(selectedMeeting.date.toDate(), 'EEEE, MMMM d, yyyy')}</span>
                      {selectedMeeting.startTime && <span>{selectedMeeting.startTime} {selectedMeeting.endTime ? `- ${selectedMeeting.endTime}` : ''}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-4">
                    <span>{isSaving ? 'Saving...' : lastSaved ? `Saved ${format(lastSaved, 'h:mm a')}` : ''}</span>
                    {currentNote && (
                      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                        <DialogTrigger render={<Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 h-8 px-2" />}>
                          <Trash2 className="h-4 w-4 mr-1" /> Delete Note
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete Note</DialogTitle>
                          </DialogHeader>
                          <p className="py-4 text-gray-600 dark:text-gray-300">Are you sure you want to delete this note? This action cannot be undone.</p>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteNote}>Delete</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    <Dialog open={isDeleteMeetingDialogOpen} onOpenChange={setIsDeleteMeetingDialogOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Meeting</DialogTitle>
                        </DialogHeader>
                        <p className="py-4 text-gray-600 dark:text-gray-300">Are you sure you want to delete this meeting? This will also delete its notes. This action cannot be undone.</p>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsDeleteMeetingDialogOpen(false)}>Cancel</Button>
                          <Button variant="destructive" onClick={handleDeleteMeeting}>Delete</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                
                {selectedMeeting.participants.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Users className="h-4 w-4 text-gray-400 mt-1" />
                    {selectedMeeting.participants.map((p, i) => (
                      <Badge key={i} variant="secondary" className="font-normal bg-gray-100 dark:bg-gray-800">
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-4xl mx-auto space-y-8">
                {/* Notes Editor */}
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col min-h-[400px]">
                  <RichTextEditor 
                    key={`${selectedMeetingId}-${currentNote?.id || 'new'}`}
                    content={noteContent}
                    onChange={handleNoteChange}
                    onBlur={handleBlur}
                    placeholder="Start typing meeting notes here..." 
                  />
                </div>

                {/* Action Items Section */}
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center">
                      <Check className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" /> Action Items
                    </h2>
                  </div>
                  
                  <div className="flex space-x-2 mb-6">
                    <Input 
                      placeholder="Enter person's name to extract action items..." 
                      value={aiPersonName}
                      onChange={e => setAiPersonName(e.target.value)}
                      className="max-w-sm"
                    />
                    <Button 
                      onClick={handleGenerateActionItems} 
                      disabled={!aiPersonName.trim() || isGeneratingAi || !noteContent.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {isGeneratingAi ? 'Generating...' : <><Sparkles className="h-4 w-4 mr-2" /> Generate with AI</>}
                    </Button>
                  </div>

                  {currentNote?.actionItems && currentNote.actionItems.length > 0 ? (
                    <div className="space-y-3">
                      {currentNote.actionItems.map(item => (
                        <div key={item.id} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-100 dark:border-gray-800 group">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center space-x-2 mb-1">
                              <Badge variant="outline" className="text-xs font-medium bg-white dark:bg-gray-900">{item.personName}</Badge>
                              {item.movedToTasks && <Badge variant="secondary" className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">In Tasks</Badge>}
                            </div>
                            <p className="text-sm text-gray-800 dark:text-gray-200">{item.description}</p>
                          </div>
                          <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!item.movedToTasks && (
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleMoveToActionItem(item)}>
                                Move to Tasks <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => handleDeleteActionItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-md">
                      No action items yet. Type notes and use AI to extract them.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <CalendarIcon className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p>Select a meeting from the sidebar to view or take notes.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

