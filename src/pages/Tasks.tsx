import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Task } from '../lib/types';
import { format, isPast, isToday } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

export function Tasks() {
  const { user } = useAuth();
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [closedTasks, setClosedTasks] = useState<Task[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  
  const [finishingTask, setFinishingTask] = useState<Task | null>(null);
  const [finishComment, setFinishComment] = useState('');

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');

  const openTaskModal = (task: Task) => {
    setSelectedTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDesc(task.description || '');
    setEditTaskDueDate(task.dueDate ? format(task.dueDate.toDate(), 'yyyy-MM-dd') : '');
    setIsEditingTask(false);
    setIsTaskModalOpen(true);
  };

  const handleUpdateTask = async () => {
    if (!selectedTask || !editTaskTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        title: editTaskTitle,
        description: editTaskDesc,
        dueDate: editTaskDueDate ? new Date(editTaskDueDate) : null,
      });
      setIsEditingTask(false);
      toast.success('Task updated successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update task');
    }
  };

  useEffect(() => {
    if (!user) return;

    const qOpen = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('status', '==', 'open'), orderBy('createdAt', 'desc'));
    const unsubOpen = onSnapshot(qOpen, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      // Sort client-side by due date if exists
      tasks.sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.toMillis() - b.dueDate.toMillis();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
      setOpenTasks(tasks);
    });

    const qClosed = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('status', '==', 'closed'), orderBy('closedAt', 'desc'));
    const unsubClosed = onSnapshot(qClosed, (snapshot) => {
      setClosedTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    });

    return () => {
      unsubOpen();
      unsubClosed();
    };
  }, [user]);

  const handleAddTask = async () => {
    if (!user || !newTaskTitle.trim()) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        userId: user.uid,
        title: newTaskTitle,
        description: newTaskDesc,
        dueDate: newTaskDueDate ? new Date(newTaskDueDate) : null,
        status: 'open',
        closedAt: null,
        closedComment: null,
        createdAt: serverTimestamp(),
        sourceType: 'manual',
        sourceNoteId: null,
        sourceActionItemId: null
      });
      setIsAddModalOpen(false);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskDueDate('');
      toast.success('Task added successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add task');
    }
  };

  const handleFinishTask = async () => {
    if (!finishingTask) return;

    try {
      await updateDoc(doc(db, 'tasks', finishingTask.id), {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedComment: finishComment || null
      });
      setFinishingTask(null);
      setFinishComment('');
      toast.success('Task completed');
    } catch (error) {
      console.error(error);
      toast.error('Failed to complete task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      toast.success('Task deleted');
      if (selectedTask?.id === taskId) {
        setIsTaskModalOpen(false);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete task');
    }
  };

  return (
    <div className="p-8 h-full overflow-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Tasks</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your action items and to-dos.</p>
          </div>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger render={<Button />}>
              + Add Task
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Task</DialogTitle>
                <DialogDescription>Create a new task to track your work.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
                  <Input id="title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="What needs to be done?" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea id="desc" value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} placeholder="Add some details..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" type="date" value={newTaskDueDate} onChange={(e) => setNewTaskDueDate(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button onClick={handleAddTask} disabled={!newTaskTitle.trim()}>Save Task</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="open" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="open">Open Tasks ({openTasks.length})</TabsTrigger>
            <TabsTrigger value="closed">Closed Tasks ({closedTasks.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="open" className="space-y-4">
            {openTasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-gray-500">No open tasks. You're all caught up!</p>
                </CardContent>
              </Card>
            ) : (
              openTasks.map(task => {
                const isDueToday = task.dueDate && isToday(task.dueDate.toDate());
                const isOverdue = task.dueDate && isPast(task.dueDate.toDate()) && !isDueToday;
                
                return (
                  <Card key={task.id} className={`cursor-pointer transition-colors hover:shadow-md ${isOverdue ? 'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/30' : isDueToday ? 'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/30' : ''}`} onClick={() => openTaskModal(task)}>
                    <CardContent className="p-6 flex justify-between items-start">
                      <div className="space-y-2 flex-1 pr-4">
                        <h3 className="font-semibold text-lg">{task.title}</h3>
                        {task.description && <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap line-clamp-2">{task.description}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {task.dueDate && (
                            <Badge variant={isOverdue ? 'destructive' : isDueToday ? 'default' : 'secondary'} className={isDueToday ? 'bg-amber-500 hover:bg-amber-600' : ''}>
                              Due: {format(task.dueDate.toDate(), 'MMM d, yyyy')}
                            </Badge>
                          )}
                          {task.sourceType === 'actionItem' && (
                            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">From Meeting Action Item</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {finishingTask?.id === task.id ? (
                          <div className="flex flex-col gap-2 items-end">
                            <Input 
                              placeholder="Add a comment (optional)" 
                              value={finishComment} 
                              onChange={(e) => setFinishComment(e.target.value)}
                              className="w-64"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setFinishingTask(null)}>Cancel</Button>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleFinishTask}>Confirm Finish</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => {
                              setSelectedTask(task);
                              setEditTaskTitle(task.title);
                              setEditTaskDesc(task.description || '');
                              setEditTaskDueDate(task.dueDate ? format(task.dueDate.toDate(), 'yyyy-MM-dd') : '');
                              setIsEditingTask(true);
                              setIsTaskModalOpen(true);
                            }}>
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-green-600 dark:text-green-500 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400" onClick={() => setFinishingTask(task)}>
                              Finish
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
          
          <TabsContent value="closed" className="space-y-4">
            {closedTasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-gray-500">No closed tasks yet.</p>
                </CardContent>
              </Card>
            ) : (
              closedTasks.map(task => (
                <Card key={task.id} className="opacity-75 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => openTaskModal(task)}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg line-through text-gray-500 dark:text-gray-400">{task.title}</h3>
                        {task.closedComment && (
                          <div className="mt-2 text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded-md border border-gray-200 dark:border-gray-700">
                            <span className="font-medium">Comment:</span> {task.closedComment}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
                        <div>Closed: {task.closedAt ? format(task.closedAt.toDate(), 'MMM d, yyyy') : 'Unknown'}</div>
                      </div>
                      <div className="ml-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => handleDeleteTask(task.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Task Details Modal */}
      <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{isEditingTask ? 'Edit Task' : 'Task Details'}</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4 py-4">
              {isEditingTask ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Title <span className="text-red-500">*</span></Label>
                    <Input id="edit-title" value={editTaskTitle} onChange={(e) => setEditTaskTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-desc">Description</Label>
                    <Textarea id="edit-desc" value={editTaskDesc} onChange={(e) => setEditTaskDesc(e.target.value)} className="min-h-[100px]" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-dueDate">Due Date</Label>
                    <Input id="edit-dueDate" type="date" value={editTaskDueDate} onChange={(e) => setEditTaskDueDate(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold text-xl">{selectedTask.title}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant={selectedTask.status === 'open' ? 'default' : 'secondary'}>
                        {selectedTask.status.toUpperCase()}
                      </Badge>
                      {selectedTask.dueDate && (
                        <Badge variant="outline">
                          Due: {format(selectedTask.dueDate.toDate(), 'MMM d, yyyy')}
                        </Badge>
                      )}
                      {selectedTask.createdAt && (
                        <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          Created: {format(selectedTask.createdAt.toDate(), 'MMM d, yyyy')}
                        </Badge>
                      )}
                      {selectedTask.status === 'closed' && selectedTask.closedAt && (
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                          Finished: {format(selectedTask.closedAt.toDate(), 'MMM d, yyyy')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {selectedTask.description && (
                    <div className="mt-4">
                      <Label className="text-gray-500 dark:text-gray-400">Description</Label>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{selectedTask.description}</p>
                    </div>
                  )}
                  {selectedTask.status === 'closed' && selectedTask.closedComment && (
                    <div className="mt-4 bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                      <Label className="text-gray-500 dark:text-gray-400">Closing Comment</Label>
                      <p className="mt-1 text-sm">{selectedTask.closedComment}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {isEditingTask ? (
              <>
                <Button variant="outline" onClick={() => setIsEditingTask(false)}>Cancel</Button>
                <Button onClick={handleUpdateTask} disabled={!editTaskTitle.trim()}>Save Changes</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsTaskModalOpen(false)}>Close</Button>
                {selectedTask?.status === 'open' && (
                  <Button onClick={() => setIsEditingTask(true)}>Edit Task</Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

