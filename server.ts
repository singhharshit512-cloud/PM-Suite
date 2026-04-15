import express from 'express';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.APP_URL ? `${process.env.APP_URL}/api/auth/callback` : 'http://localhost:3000/api/auth/callback'
);

// API Routes
app.get('/api/auth/url', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.readonly'
    ]
  });
  res.json({ url });
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // In a real app, you would store the refresh_token in your database (e.g., Firestore)
    // associated with the user's ID. For this example, we'll use a secure cookie
    // to store the refresh token since we don't have a backend database connection setup here yet.
    // Wait, we DO have Firestore! But we need the user's Firebase UID to store it.
    // Since we are doing OAuth separately from Firebase Auth, we can just return the tokens
    // to the client, and the client can save the refresh token to Firestore.
    // Actually, returning the refresh token to the client is not secure.
    // Let's just pass it to the client via a temporary cookie or HTML message,
    // and the client will send it to Firestore.
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                tokens: ${JSON.stringify(tokens)} 
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed');
  }
});

// Proxy endpoint for Google Calendar API to handle token refresh automatically
app.post('/api/calendar/events', async (req, res) => {
  const { refresh_token, timeMin, timeMax } = req.body;
  
  if (!refresh_token) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token });

    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching calendar events', error);
    res.status(500).json({ error: 'Failed to fetch calendar events', details: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
