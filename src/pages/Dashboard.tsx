import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchTodayMeetings, fetchUpcomingMeetings } from '../lib/calendar';
import { Task } from '../lib/types';
import { format, isToday, isFuture, isTomorrow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Calendar, CheckSquare, Clock, CheckCircle2, CheckCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

export function Dashboard() {
  const { user, googleAccessToken, syncTrigger, triggerSync, signInWithGoogle, clearToken } = useAuth();
  const [meetingsTodayCount, setMeetingsTodayCount] = useState(0);
  const [nextMeeting, setNextMeeting] = useState<any>(null);
  const [openTasksCount, setOpenTasksCount] = useState(0);
  const [tasksDueTodayCount, setTasksDueTodayCount] = useState(0);
  const [closedTodayCount, setClosedTodayCount] = useState(0);
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [tasksDueToday, setTasksDueToday] = useState<Task[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      if (!googleAccessToken) {
        await signInWithGoogle();
      }
      triggerSync();
      toast.success('Calendar synced successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to sync calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch Open Tasks
    const qOpenTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('status', '==', 'open'));
    const unsubOpenTasks = onSnapshot(qOpenTasks, (snapshot) => {
      setOpenTasksCount(snapshot.size);
      
      const dueToday: Task[] = [];
      snapshot.forEach((doc) => {
        const task = { id: doc.id, ...doc.data() } as Task;
        if (task.dueDate && isToday(task.dueDate.toDate())) {
          dueToday.push(task);
        }
      });
      setTasksDueTodayCount(dueToday.length);
      setTasksDueToday(dueToday);
    });

    // Fetch Closed Today Tasks
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const qClosedTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid), where('status', '==', 'closed'), where('closedAt', '>=', Timestamp.fromDate(startOfToday)));
    const unsubClosedTasks = onSnapshot(qClosedTasks, (snapshot) => {
      setClosedTodayCount(snapshot.size);
    });

    return () => {
      unsubOpenTasks();
      unsubClosedTasks();
    };
  }, [user]);

  useEffect(() => {
    if (googleAccessToken) {
      fetchTodayMeetings(googleAccessToken)
        .then((data) => {
          const events = data.items || [];
          setMeetingsTodayCount(events.length);
          setTodayEvents(events);
        })
        .catch((error) => {
          console.error(error);
          if (error.message === 'UNAUTHORIZED') {
            clearToken();
          }
        });

      fetchUpcomingMeetings(googleAccessToken)
        .then((data) => {
          const events = data.items || [];
          const upcoming = events.filter((e: any) => {
            const start = new Date(e.start.dateTime || e.start.date);
            return isFuture(start);
          }).sort((a: any, b: any) => {
            const startA = new Date(a.start.dateTime || a.start.date).getTime();
            const startB = new Date(b.start.dateTime || b.start.date).getTime();
            return startA - startB;
          });

          if (upcoming.length > 0) {
            setNextMeeting(upcoming[0]);
          }
        })
        .catch((error) => {
          console.error(error);
          if (error.message === 'UNAUTHORIZED') {
            clearToken();
          }
        });
    }
  }, [googleAccessToken, syncTrigger]);

  return (
    <div className="p-8 h-full overflow-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Good morning, {user?.displayName?.split(' ')[0]}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Here is what's happening today.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing} className="bg-white dark:bg-gray-900 shadow-sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync Calendar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Meetings Today</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{meetingsTodayCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Meeting</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold truncate" title={nextMeeting?.summary}>
                {nextMeeting ? nextMeeting.summary : 'None'}
              </div>
              <p className="text-xs text-muted-foreground">
                {nextMeeting ? (
                  isToday(new Date(nextMeeting.start.dateTime || nextMeeting.start.date)) 
                    ? format(new Date(nextMeeting.start.dateTime || nextMeeting.start.date), 'h:mm a')
                    : isTomorrow(new Date(nextMeeting.start.dateTime || nextMeeting.start.date))
                      ? `Tomorrow, ${format(new Date(nextMeeting.start.dateTime || nextMeeting.start.date), 'h:mm a')}`
                      : format(new Date(nextMeeting.start.dateTime || nextMeeting.start.date), 'MMM d, h:mm a')
                ) : 'No upcoming meetings'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{openTasksCount}</div>
            </CardContent>
          </Card>
          <Card className={tasksDueTodayCount > 0 ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due Today</CardTitle>
              <CheckCircle2 className={`h-4 w-4 ${tasksDueTodayCount > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${tasksDueTodayCount > 0 ? "text-amber-600 dark:text-amber-500" : ""}`}>{tasksDueTodayCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Closed Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-500">{closedTodayCount}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Today's Meetings Timeline */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Today's Meetings</CardTitle>
            </CardHeader>
            <CardContent>
              {todayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meetings scheduled for today.</p>
              ) : (
                <div className="space-y-4">
                  {todayEvents.map((event) => (
                    <div key={event.id} className="flex items-start space-x-4 border-l-2 border-blue-500 pl-4 py-1">
                      <div className="min-w-[80px] text-sm font-medium">
                        {format(new Date(event.start.dateTime || event.start.date), 'h:mm a')}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none">{event.summary}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.attendees ? `${event.attendees.length} participants` : 'No participants'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks Due Today */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Tasks Due Today</CardTitle>
            </CardHeader>
            <CardContent>
              {tasksDueToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks due today 🎉</p>
              ) : (
                <div className="space-y-4">
                  {tasksDueToday.map((task) => (
                    <div key={task.id} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium leading-none">{task.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {format(task.createdAt.toDate(), 'MMM d')}
                        </p>
                      </div>
                      <Link to="/tasks" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                        Go to Task
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

