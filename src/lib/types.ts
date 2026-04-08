export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: any;
}

export interface Meeting {
  id: string;
  userId: string;
  title: string;
  date: any; // Firestore Timestamp
  startTime: string;
  endTime: string;
  googleEventId: string | null;
  participants: { name: string; email: string }[];
  isOffline: boolean;
  createdAt: any;
}

export interface ActionItem {
  id: string;
  personName: string;
  description: string;
  movedToTasks: boolean;
  taskId: string | null;
}

export interface Note {
  id: string;
  userId: string;
  meetingId: string;
  content: string;
  actionItems: ActionItem[];
  createdAt: any;
  updatedAt: any;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  dueDate: any | null;
  status: 'open' | 'closed';
  closedAt: any | null;
  closedComment: string | null;
  createdAt: any;
  sourceType: 'manual' | 'actionItem';
  sourceNoteId: string | null;
  sourceActionItemId: string | null;
}
