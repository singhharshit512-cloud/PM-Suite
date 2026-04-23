import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function fetchRecentDocs(userId: string) {
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

    const response = await fetch('/api/drive/recent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        access_token: accessToken
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      let errorDetail = 'Failed to fetch drive files';
      try {
          const errData = await response.json();
          if (errData.details) errorDetail += `: ${errData.details}`;
      } catch (e) {}
      throw new Error(errorDetail);
    }

    const text = await response.text();
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
        throw new Error("Received an HTML response instead of JSON.");
    }
    return JSON.parse(text);
  } catch (error: any) {
    if (error.message !== 'UNAUTHORIZED') {
      console.error('Error fetching drive files:', error);
    }
    throw error;
  }
}
