import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function fetchTodayMeetings(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  try {
    const accessToken = localStorage.getItem('googleAccessToken');
    const { getCachedOrFetch } = await import('../utils/cache.ts');
    const userData = await getCachedOrFetch(`client:${userId}:userDoc`, 300, async () => {
       const userDoc = await getDoc(doc(db, 'users', userId));
       return userDoc.exists() ? userDoc.data() : null;
    });
    const refreshToken = userData?.calendarRefreshToken;

    if (!accessToken && !refreshToken) {
      throw new Error('UNAUTHORIZED');
    }

    const response = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        access_token: accessToken,
        timeMin: startOfDay,
        timeMax: endOfDay
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      let errorDetail = 'Failed to fetch calendar events';
      try {
          const errData = await response.json();
          if (errData.details) errorDetail += `: ${errData.details}`;
      } catch (e) {}
      throw new Error(errorDetail);
    }

    const text = await response.text();
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
        throw new Error("Received an HTML response instead of JSON. The application session may have expired or cookies are blocked. Please refresh or open the app in a new tab.");
    }
    return JSON.parse(text);
  } catch (error: any) {
    if (error.message !== 'UNAUTHORIZED') {
      console.error('Error fetching today meetings:', error);
    }
    throw error;
  }
}

export async function fetchUpcomingMeetings(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfNextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();

  try {
    const accessToken = localStorage.getItem('googleAccessToken');
    const { getCachedOrFetch } = await import('../utils/cache.ts');
    const userData = await getCachedOrFetch(`client:${userId}:userDoc`, 300, async () => {
       const userDoc = await getDoc(doc(db, 'users', userId));
       return userDoc.exists() ? userDoc.data() : null;
    });
    const refreshToken = userData?.calendarRefreshToken;

    if (!accessToken && !refreshToken) {
      throw new Error('UNAUTHORIZED');
    }

    const response = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        access_token: accessToken,
        timeMin: startOfDay,
        timeMax: endOfNextWeek
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      let errorDetail = 'Failed to fetch calendar events';
      try {
          const errData = await response.json();
          if (errData.details) errorDetail += `: ${errData.details}`;
      } catch (e) {}
      throw new Error(errorDetail);
    }

    const text = await response.text();
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
        throw new Error("Received an HTML response instead of JSON. The application session may have expired or cookies are blocked. Please refresh or open the app in a new tab.");
    }
    return JSON.parse(text);
  } catch (error: any) {
    if (error.message !== 'UNAUTHORIZED') {
      console.error('Error fetching upcoming meetings:', error);
    }
    throw error;
  }
}
