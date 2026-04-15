import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function fetchTodayMeetings(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const refreshToken = userDoc.data()?.calendarRefreshToken;

    if (!refreshToken) {
      throw new Error('UNAUTHORIZED');
    }

    const response = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        timeMin: startOfDay,
        timeMax: endOfDay
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      throw new Error('Failed to fetch calendar events');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching today meetings:', error);
    throw error;
  }
}

export async function fetchUpcomingMeetings(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfNextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const refreshToken = userDoc.data()?.calendarRefreshToken;

    if (!refreshToken) {
      throw new Error('UNAUTHORIZED');
    }

    const response = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        timeMin: startOfDay,
        timeMax: endOfNextWeek
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      throw new Error('Failed to fetch calendar events');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching upcoming meetings:', error);
    throw error;
  }
}
