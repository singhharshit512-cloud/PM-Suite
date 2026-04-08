export async function fetchTodayMeetings(accessToken: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      const errorData = await response.json().catch(() => null);
      if (response.status === 404) {
        console.warn('Calendar not found for user, returning empty events.');
        return { items: [] };
      }
      console.error('Calendar API error:', errorData);
      throw new Error('Failed to fetch calendar events');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching today meetings:', error);
    throw error; // Rethrow to handle in component
  }
}

export async function fetchUpcomingMeetings(accessToken: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfNextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfNextWeek}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      const errorData = await response.json().catch(() => null);
      if (response.status === 404) {
        console.warn('Calendar not found for user, returning empty events.');
        return { items: [] };
      }
      console.error('Calendar API error:', errorData);
      throw new Error('Failed to fetch calendar events');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching upcoming meetings:', error);
    throw error; // Rethrow to handle in component
  }
}
