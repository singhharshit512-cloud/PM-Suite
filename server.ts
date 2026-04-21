import express from 'express';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { adminRouter, db } from './adminBackend.ts';
import { logRequest, logError } from './backendLogger.ts';

dotenv.config({ override: true });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const PORT = 3000;

// Gemini Proxy
app.use('/api/gemini-proxy', createProxyMiddleware({
  target: 'https://generativelanguage.googleapis.com',
  changeOrigin: true,
  pathRewrite: (path) => {
    let newPath = path.replace('/api/gemini-proxy', '');
    console.log('Gemini proxy rewriting path:', path, '->', newPath);
    return newPath;
  },
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log('Proxying request to Gemini API:', req.method, proxyReq.path);
      // Inject the real API key natively through headers (GoogleGenAI supports this optionally or via x-goog-api-key)
      proxyReq.setHeader('x-goog-api-key', process.env.GEMINI_API_KEY || '');
      if ((req as any).body) {
        fixRequestBody(proxyReq, req);
      }
    }
  }
}));

app.use(express.json());
app.use(cookieParser());
app.use(logRequest);

app.use('/api/admin', adminRouter);

// API Routes
app.get('/api/auth/url', (req, res) => {
  let host = process.env.APP_URL;
  if (!host) {
    const forwardedHost = req.headers['x-forwarded-host'];
    if (forwardedHost) {
      host = `https://${Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost}`;
    } else {
      host = `https://${req.get('host')}`;
    }
  }
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${host}/api/auth/callback`
  );

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/documents'
    ]
  });
  res.json({ url });
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    let host = process.env.APP_URL;
    if (!host) {
      const forwardedHost = req.headers['x-forwarded-host'];
      if (forwardedHost) {
        host = `https://${Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost}`;
      } else {
        host = `https://${req.get('host')}`;
      }
    }
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${host}/api/auth/callback`
    );

    const { tokens } = await client.getToken(code as string);
    
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
  } catch (error: any) {
    logError(error, req);
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed: ' + error.message + ' ' + JSON.stringify(error.response?.data || {}));
  }
});

// Proxy endpoint for Google Calendar API to handle token refresh automatically
app.post('/api/calendar/events', async (req, res) => {
  const { refresh_token, access_token, timeMin, timeMax } = req.body;
  
  if (!refresh_token && !access_token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    // Provide whatever tokens we have. If access_token is expired but refresh_token 
    // is available, the Google client will automatically refresh it!
    const credentials: any = {};
    if (access_token) credentials.access_token = access_token;
    if (refresh_token) credentials.refresh_token = refresh_token;
    
    client.setCredentials(credentials);

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
    logError(error, req);
    if (
      error.message === 'invalid_grant' || 
      error.response?.data?.error === 'invalid_grant' ||
      error.message?.includes('invalid_grant') ||
      error.message?.includes('invalid authentication credentials') ||
      error.message?.includes('insufficient authentication scopes') ||
      error.response?.status === 401
    ) {
      console.warn('Calendar token expired or revoked or missing scopes');
      return res.status(401).json({ error: 'invalid_grant', details: 'Token has been expired or revoked or missing scopes.' });
    }
    
    console.error('Error fetching calendar events', error);
    res.status(500).json({ error: 'Failed to fetch calendar events', details: error.message });
  }
});

// Proxy endpoint for Google Drive API to fetch recent docs
app.post('/api/drive/recent', async (req, res) => {
  const { refresh_token, access_token } = req.body;
  
  if (!refresh_token && !access_token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    const credentials: any = {};
    if (access_token) credentials.access_token = access_token;
    if (refresh_token) credentials.refresh_token = refresh_token;
    
    client.setCredentials(credentials);

    const drive = google.drive({ version: 'v3', auth: client });
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      orderBy: "viewedByMeTime desc",
      pageSize: 5,
      fields: "files(id, name, modifiedTime, viewedByMeTime)",
    });

    res.json(response.data);
  } catch (error: any) {
    logError(error, req);
    if (
      error.message === 'invalid_grant' || 
      error.response?.data?.error === 'invalid_grant' ||
      error.message?.includes('invalid_grant') ||
      error.message?.includes('invalid authentication credentials') ||
      error.message?.includes('insufficient authentication scopes') ||
      error.response?.status === 401
    ) {
      console.warn('Drive token expired or revoked or missing scopes');
      return res.status(401).json({ error: 'invalid_grant', details: 'Token has been expired or revoked or missing scopes.' });
    }
    
    console.error('Error fetching drive files', error);
    res.status(500).json({ error: 'Failed to fetch drive files', details: error.message });
  }
});

// Recall.ai Bot Endpoints
app.post('/api/bot/join', async (req, res) => {
  const { meetingUrl, meetingId, userId } = req.body;
  
  if (!process.env.RECALL_API_KEY) {
    return res.status(400).json({ error: 'RECALL_API_KEY is not configured. Please add it to your environment variables.' });
  }

  let host = process.env.APP_URL;
  if (!host) {
    const forwardedHost = req.headers['x-forwarded-host'];
    if (forwardedHost) {
      host = `https://${Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost}`;
    } else {
      host = `https://${req.get('host')}`;
    }
  }
  const webhookUrl = `${host}/api/bot/webhook`;

  try {
    const response = await fetch('https://us-west-2.recall.ai/api/v1/bot', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.RECALL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: 'AI Note Taker',
        webhook_url: webhookUrl,
        recording_config: {
          start_recording_on: 'participant_join',
          transcript: {
            provider: {
              gladia_v2_streaming: {}
            }
          }
        },
        metadata: {
          meetingId,
          userId
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      let errorMessage = `Recall API error: ${error}`;
      try {
        const errorJson = JSON.parse(error);
        if (errorJson.transcription_options?.non_field_errors?.[0]?.includes('credentials not configured')) {
           errorMessage = 'Transcription provider not configured. Please go to your Recall.ai dashboard (https://us-west-2.recall.ai/dashboard/transcription) and configure a transcription provider like Gladia or AssemblyAI.';
        }
      } catch (e) {
    logError(e, req);
        // Ignore JSON parse error
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    res.json({ success: true, botId: data.id });
  } catch (error: any) {
    logError(error, req);
    console.error('Error joining bot:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bot/meeting/:meetingId', async (req, res) => {
  if (!process.env.RECALL_API_KEY) return res.status(500).json({ error: 'RECALL_API_KEY not configured' });
  try {
    // We can list bots and filter by meetingId? Or we expect frontend to pass the botId.
    // If frontend doesn't have botId, it's hard. But maybe frontend has it.
    // Let's just make an endpoint to fetch transcript by botId.
    res.status(404).json({ error: 'Deprecated endpoints. Fetch directly by botId.' });
  } catch (error: any) {
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bot/:botId/transcript', async (req, res) => {
  if (!process.env.RECALL_API_KEY) return res.status(500).json({ error: 'RECALL_API_KEY not configured' });
  try {
    // Also fetch BOT status to know if we can show that
    const botResponse = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${req.params.botId}/`, {
      headers: { 'Authorization': `Token ${process.env.RECALL_API_KEY}` }
    });
    const botData = await botResponse.json();

    let transcriptId = null;
    
    // First, check transcript property at root level if recordings is missing or empty
    if (botData.transcripts && botData.transcripts.length > 0) {
       // It could be deep inside an artifact format natively on the API V2 sometimes
       transcriptId = botData.transcripts[0].id || botData.transcripts[0];
    } else if (botData.transcript_id) {
       transcriptId = botData.transcript_id;
    } else if (botData.video_url && botData.status_changes && botData.status_changes.find((s:any)=>s.code === 'done')) {
       // if we have no clear ID, but it is done, we can query transcript list 
       const transcriptListRes = await fetch(`https://us-west-2.recall.ai/api/v1/transcript/?bot_id=${req.params.botId}`, {
          headers: { 'Authorization': `Token ${process.env.RECALL_API_KEY}` }
       });
       const transcriptListData = await transcriptListRes.json();
       if (transcriptListData.results && transcriptListData.results.length > 0) {
         transcriptId = transcriptListData.results[0].id;
       }
    }

    if (!transcriptId && botData.recordings && Array.isArray(botData.recordings)) {
      for (const recording of botData.recordings) {
        if (recording.media_shortcuts?.transcript?.id) {
          transcriptId = recording.media_shortcuts.transcript.id;
          break;
        }
      }
    }
    
    let rawTranscript = '';
    let transcriptData = null;

    if (transcriptId) {
      const transcriptResponse = await fetch(`https://us-west-2.recall.ai/api/v1/transcript/${transcriptId}`, {
        headers: { 'Authorization': `Token ${process.env.RECALL_API_KEY}` }
      });
      
      if (transcriptResponse.ok) {
        const metadata = await transcriptResponse.json();
        if (metadata?.data?.download_url) {
           const actualDataRes = await fetch(metadata.data.download_url);
           transcriptData = await actualDataRes.json();
        } else {
           transcriptData = metadata;
        }
      } else {
        const errorText = await transcriptResponse.text();
        return res.status(transcriptResponse.status).json({ error: `Recall API error: ${errorText}` });
      }
    } else {
      console.log("No transcript artifact ID found. Checking bot status... Bot Data keys:", Object.keys(botData));
      const isDone = botData.status_changes && botData.status_changes.find((s:any) => s.code === 'done' || s.code === 'call_ended');
      if (isDone) {
         return res.status(404).json({ error: "The meeting has ended, but the transcript is still processing on the servers. Please wait a few minutes and try again." });
      } else {
         return res.status(404).json({ error: "The bot is still on the call or processing. Transcript data isn't ready yet." });
      }
    }

    let actualTranscriptArray = transcriptData;
    if (transcriptData && !Array.isArray(transcriptData)) { 
       actualTranscriptArray = transcriptData.parts || transcriptData.results || transcriptData.data || [];
    }

    if (Array.isArray(actualTranscriptArray) && actualTranscriptArray.length > 0) {
      rawTranscript = actualTranscriptArray.map((t: any) => {
        const speakerName = t.speaker || t.participant?.name || 'Unknown';
        const words = t.words?.map((w:any) => w.text).join('') || t.text || ''; // fix extra space insertion on Gladia words
        return `${speakerName}: ${words}`;
      }).join('\n');
    } else if (botData && botData.status_changes) {
      // Transcript object existed but there are no words/parts mapped
      const isDone = botData.status_changes.find((s:any) => s.code === 'done' || s.code === 'call_ended');
      if (isDone && !transcriptData) {
         return res.status(404).json({ error: "The meeting recording is accessible, but the transcript is still processing or unavailable. Please wait a few minutes and try again." });
      } else if (!isDone) {
         return res.status(404).json({ error: "The bot is still on the call. End the meeting or wait for the bot to leave before fetching transcripts." });
      }
    }

    res.json({ transcript: rawTranscript, rawData: transcriptData, botStatus: botData.status_changes });
  } catch (error: any) {
    logError(error, req);
    console.error("Transcript fetch error: ", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bot/generate-notes', async (req, res) => {
  const { meetingId, userId, transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

  try {
    console.log('Generating notes... key start:', process.env.GEMINI_API_KEY?.substring(0, 5), 'length:', process.env.GEMINI_API_KEY?.length);
    const prompt = `
      You are an expert meeting note taker. 
      Analyze the following meeting transcript. The transcript may contain both English and Hindi.
      
      Please generate a comprehensive meeting note that includes:
      1. A brief summary of the meeting.
      2. Key discussion points.
      3. Action items (if any).
      4. A clean, formatted version of the transcript with speaker names and what they said.
      
      Ensure the output is formatted in clean HTML (using <h1>, <h2>, <ul>, <li>, <p>, <strong>, etc.) suitable for a rich text editor.
      Do NOT wrap the HTML in markdown code blocks (like \`\`\`html). Just return the raw HTML string.
      
      Transcript:
      ${transcript}
    `;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt
    });

    let generatedHtml = aiResponse.text || '';
    generatedHtml = generatedHtml.replace(/^```html\n/, '').replace(/\n```$/, '');

    // Skip server-side saving, send back to frontend
    res.json({ success: true, content: generatedHtml });
  } catch (error: any) {
    logError(error, req);
    let errorMessage = error.message || 'Unknown error occurred during note generation';
    const stringifiedError = typeof error === 'object' ? JSON.stringify(error) : String(error);
    const fullErrorStr = errorMessage + ' ' + stringifiedError;

    if (fullErrorStr.includes("429") || fullErrorStr.includes("RESOURCE_EXHAUSTED") || fullErrorStr.includes("monthly spending cap")) {
      errorMessage = "Your Gemini API Key has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.";
      console.warn("NOTES GENERATION QUOTA REACHED: ", errorMessage);
    } else if (fullErrorStr.includes("API key not valid") || fullErrorStr.includes("insufficient authentication scopes") || fullErrorStr.includes("MY_GEMINI_API_KEY")) {
      errorMessage = "Your Gemini API Key is invalid or set to a placeholder. Please provide a valid Gemini API key in the AI Studio Settings menu under secrets (GEMINI_API_KEY) and refresh.";
      console.warn("NOTES GENERATION INVALID KEY: ", errorMessage);
    } else if (fullErrorStr.includes("503") || fullErrorStr.includes("UNAVAILABLE") || fullErrorStr.includes("high demand")) {
      errorMessage = "The AI model is currently experiencing high demand and is temporarily unavailable. Please try again in a few moments.";
      console.warn("NOTES GENERATION SERVICE UNAVAILABLE: ", errorMessage);
    } else {
      console.error("NOTES GENERATION ERROR: ", error);
    }
    res.status(500).json({ error: errorMessage, details: error.stack });
  }
});

app.post('/api/bot/webhook', async (req, res) => {
  const event = req.body;
  
  // Acknowledge receipt immediately
  res.status(200).send('OK');

  try {
    if (event.event === 'bot.status_change' && event.data.status.code === 'done') {
      const botId = event.data.bot_id;
      const metadata = event.data.metadata;
      
      if (!metadata || !metadata.userId || !metadata.meetingId) return;

      console.log(`Bot ${botId} is done. Transcript is ready for meeting ${metadata.meetingId}. Please fetch from frontend.`);
      // Backend saving is disabled due to missing firebase admin credentials in this environment.
    }
  } catch (error: any) {
    logError(error, req);
    console.error('Webhook processing error:', error);
  }
});

app.post('/api/cowork/chat', async (req, res) => {
  const { messages, activeDocId, googleAccessToken, googleRefreshToken, uid } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Your Gemini API Key is missing. Please add it in settings." });
  }
  
  if (!uid) {
    return res.status(401).json({ error: "Unauthorized. Missing UID." });
  }

  try {
    // 1. Fetch Admin Configs
    const promptDoc = await db.collection('adminConfig').doc('coworkSystemPrompt').get();
    const templatesDoc = await db.collection('adminConfig').doc('docTemplates').get();
    const modelConfigDoc = await db.collection('adminConfig').doc('modelSettings').get();
    
    const adminPrompt = promptDoc.exists ? promptDoc.data()?.current : '';
    const templates = templatesDoc.exists ? templatesDoc.data()?.templates || [] : [];
    const modelSettings = modelConfigDoc.exists ? modelConfigDoc.data() : null;
    const dailyQuota = modelSettings?.dailyQuotaPerUser || 50;

    // 2. Check Quota
    const todayStr = new Date().toISOString().split('T')[0];
    const quotaRef = db.collection('userQuotas').doc(uid);
    const quotaDoc = await quotaRef.get();
    let currentCount = 0;
    if (quotaDoc.exists) {
       const quotaData = quotaDoc.data();
       if (quotaData?.date === todayStr) {
           currentCount = quotaData.count || 0;
       }
    }
    
    if (currentCount >= dailyQuota) {
        return res.status(429).json({ error: `You have reached your daily limit of ${dailyQuota} Cowork messages.` });
    }

    // Increment Quota
    await quotaRef.set({ date: todayStr, count: currentCount + 1 }, { merge: true });

    const formattedMessages = messages.map((m: any) => {
      let msgText = m.content || '';
      if (m.docContext && Array.isArray(m.docContext)) {
         msgText += '\n\n[SYSTEM CONTEXT: The user sees the following documents attached to this message: ' + JSON.stringify(m.docContext) + ']';
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msgText }]
      }
    });

    let templatesText = '';
    if (templates.length > 0) {
      templatesText = '\n\n## AVAILABLE TEMPLATES\n' + templates.map((t: any) => `### TYPE: ${t.name}\n${t.body}`).join('\n\n---\n');
    }

    let defaultPrompt = `You are Cowork, an intelligent document agent embedded in a PM productivity suite. You have a friendly, concise chat personality — like a smart colleague.
    
Currently Active Google Document ID: ${activeDocId || 'None'}

${adminPrompt ? '\n## ADMIN CUSTOM INSTRUCTIONS\n' + adminPrompt : ''}

## DOCUMENT WRITING APPROACH — CODE FIRST

You write all documents as clean, styled HTML code first — then the app 
converts and pushes to Google Docs. This is how you ensure rich formatting 
on every create and every edit.

---

### FOR NEW DOCUMENTS

1. Identify the document type and apply the correct template structure
2. Generate the complete document as styled HTML
3. Wrap output in <document type="new" title="[Doc Title]"> tags
4. The app will upload this HTML to Google Drive with mimeType conversion,
   which creates a fully formatted Google Doc

---

### FOR EXISTING DOCUMENTS

1. Give me the entire, modified document HTML. Do not give me partial fragments.
2. Make the requested changes WITHIN the existing HTML structure, preserving all formatting.
3. Wrap the final complete HTML in <document type="edit" doc_id="[id]"> tags
4. The app will clear the existing doc and re-upload the updated HTML,
   preserving the same doc URL, sharing settings, and revision history

---

### HTML FORMATTING STANDARDS

Always write HTML using these exact standards so Google Docs renders them correctly:

HEADINGS:
<h1 style="font-family:Arial;font-size:26px;color:#1a1a1a;border-bottom:2px solid #4285F4;padding-bottom:6px;">Title</h1>
<h2 style="font-family:Arial;font-size:20px;color:#1a1a1a;margin-top:24px;">Section</h2>
<h3 style="font-family:Arial;font-size:16px;color:#444444;margin-top:16px;">Subsection</h3>

BODY TEXT:
<p style="font-family:Arial;font-size:11pt;line-height:1.6;color:#1a1a1a;">Paragraph text here</p>

BULLET LISTS:
<ul style="font-family:Arial;font-size:11pt;line-height:1.8;color:#1a1a1a;padding-left:20px;">
  <li>Item one</li>
  <li>Item two</li>
</ul>

NUMBERED LISTS:
<ol style="font-family:Arial;font-size:11pt;line-height:1.8;color:#1a1a1a;padding-left:20px;">
  <li>Step one</li>
  <li>Step two</li>
</ol>

STANDARD TABLE:
<table style="border-collapse:collapse;width:100%;margin:16px 0;">
  <thead>
    <tr>
      <th style="background-color:#4285F4;color:#ffffff;padding:10px 12px;text-align:left;font-family:Arial;font-size:11pt;">Column Header</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background-color:#ffffff;">
      <td style="padding:9px 12px;border:1px solid #e0e0e0;font-family:Arial;font-size:11pt;">Cell value</td>
    </tr>
    <tr style="background-color:#f8f9fa;">
      <td style="padding:9px 12px;border:1px solid #e0e0e0;font-family:Arial;font-size:11pt;">Alternating row</td>
    </tr>
  </tbody>
</table>

CALLOUT — INFO (blue):
<div style="background:#E8F0FE;border-left:4px solid #4285F4;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;font-family:Arial;font-size:11pt;">
  💡 Info message here
</div>

CALLOUT — WARNING (yellow):
<div style="background:#FFF8E1;border-left:4px solid #FFC107;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;font-family:Arial;font-size:11pt;">
  ⚠️ Warning message here
</div>

CALLOUT — BLOCKER (red):
<div style="background:#FFEBEE;border-left:4px solid #F44336;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;font-family:Arial;font-size:11pt;">
  🔴 Blocker or critical issue here
</div>

CALLOUT — SUCCESS (green):
<div style="background:#E8F5E9;border-left:4px solid #34A853;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;font-family:Arial;font-size:11pt;">
  ✅ Positive update or completion note
</div>

STATUS BADGE (inline):
<span style="background:#34A853;color:#fff;padding:3px 10px;border-radius:12px;font-size:10pt;font-family:Arial;">On Track</span>
<span style="background:#FFC107;color:#fff;padding:3px 10px;border-radius:12px;font-size:10pt;font-family:Arial;">At Risk</span>
<span style="background:#F44336;color:#fff;padding:3px 10px;border-radius:12px;font-size:10pt;font-family:Arial;">Blocked</span>
<span style="background:#9E9E9E;color:#fff;padding:3px 10px;border-radius:12px;font-size:10pt;font-family:Arial;">Draft</span>

---

### OUTPUT FORMAT

Always output in this exact wrapper so the app can parse it:

<document type="new" title="Document Title Here">
  [complete HTML document here]
</document>

or for edits:

<document type="edit" doc_id="abc123xyz">
  [complete updated HTML document here]
</document>

Never output partial HTML. Always output the complete document from <h1> to 
the last section. The app replaces the entire doc content on every write.

---

### FORMATTING BEHAVIOUR RULES

- Never use plain text where a table would be clearer
- Every document must have at least one H1 and at least two H2 sections
- Action items, decisions, and owners must always be in a table — never bullets
- If adding a new section to an existing doc, inspect the existing H2 style 
  and match it exactly — same font size, same color, same margin
- If the existing doc uses a different color scheme, adopt that scheme —
  do not override it with the defaults above
- Status fields must always use badge spans, never plain text
- Dates must always be in DD MMM YYYY format (e.g. 21 Apr 2026)

${templatesText}
    
## CORE BEHAVIOR RULES
You MUST follow these rules exactly:
1. Always be concise.
2. If the user asks to search the web, provide realistic simulated data and say you searched.
3. Provide markdown formatted replies without generic boilerplate.

Wait, to trigger UI states in the frontend, you can output special tags that my backend will parse.
- If a document is found and previewed, include JSON block: \`\`\`json\n{ "type": "previewDoc", "title": "Doc Title", "snippet": "Preview text...", "modified": "Just now", "id": "doc-123" }\n\`\`\`
- If setting active doc, include JSON block: \`\`\`json\n{ "type": "setActiveDoc", "id": "d1", "title": "Doc Title" }\n\`\`\`

Only output JSON blocks for these explicit actions. Keep other text for the chat response.`;

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: formattedMessages,
      config: {
        systemInstruction: defaultPrompt,
        temperature: modelSettings?.temperature ?? 0.7,
        topP: modelSettings?.topP ?? 0.95,
        topK: modelSettings?.topK ?? 64,
        maxOutputTokens: modelSettings?.maxTokens ?? 4000,
      }
    });

    let text = aiResponse.text || '';
    
    // Parse simulated special payloads
    let docResults = undefined;
    let previewDoc = undefined;
    let setActiveDoc = undefined;

    const codeBlockRegex = /```json\n([\s\S]*?)n?```/g;
    let newText = text;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      try {
        const payload = JSON.parse(match[1]);
        if (payload.type === 'docResults') docResults = payload.docs;
        if (payload.type === 'previewDoc') previewDoc = { id: payload.id, title: payload.title, snippet: payload.snippet, modified: payload.modified };
        if (payload.type === 'setActiveDoc') setActiveDoc = { id: payload.id, title: payload.title };
        newText = newText.replace(match[0], ''); // strip the json from displayed text
      } catch (e) {
    logError(e, req);
        console.error("Failed to parse tool JSON from Cowork: ", e);
      }
    }

    const documentRegex = /<document\s+type="([^"]+)"(?:\s+(?:title="([^"]+)"|doc_id="([^"]+)"))?>([\s\S]*?)<\/document>/g;
    let docMatch;
    while ((docMatch = documentRegex.exec(newText)) !== null) {
      const docType = docMatch[1];
      const docTitle = docMatch[2];
      const docId = docMatch[3] || activeDocId;
      const docHtml = docMatch[4].trim();
      
      newText = newText.replace(docMatch[0], ''); // Strip it from chat output

      try {
        const client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        const credentials: any = {};
        if (googleAccessToken) credentials.access_token = googleAccessToken;
        if (googleRefreshToken) credentials.refresh_token = googleRefreshToken;
        client.setCredentials(credentials);
        
        const drive = google.drive({ version: 'v3', auth: client });
        
        // We write the HTML converted into a real Google Doc!
        if (docType === 'new' && docTitle) {
          const resRaw = await drive.files.create({
            requestBody: {
              name: docTitle,
              mimeType: 'application/vnd.google-apps.document',
            },
            media: {
              mimeType: 'text/html',
              body: docHtml
            }
          });
          setActiveDoc = { id: resRaw.data.id, title: resRaw.data.name };
          newText += `\n\n✅ Created new Google Document: **${resRaw.data.name}**`;
        } else if (docType === 'edit' && docId) {
          await drive.files.update({
            fileId: docId,
            media: {
              mimeType: 'text/html',
              body: docHtml
            }
          });
          newText += `\n\n✅ Updated existing Google Document.`;
        } else {
             newText += `\n\n*(Note: I tried to generate a document, but missing title or active ID)*`;
        }
      } catch (e: any) {
    logError(e, req);
        console.error("Failed to convert HTML to Google Document:", e.message);
        let errorDetail = e.message;
        newText += `\n\n*(Note: I tried to create/update the document, but the Google Drive API rejected the action: ${errorDetail})*`;
      }
    }

    res.json({ 
      success: true, 
      content: newText.trim(),
      docResults,
      previewDoc,
      setActiveDoc
    });

  } catch (error: any) {
    logError(error, req);
    let errorMessage = error.message || 'Unknown error occurred during Cowork chat';
    const stringifiedError = typeof error === 'object' ? JSON.stringify(error) : String(error);
    const fullErrorStr = errorMessage + ' ' + stringifiedError;

    if (fullErrorStr.includes("429") || fullErrorStr.includes("RESOURCE_EXHAUSTED") || fullErrorStr.includes("monthly spending cap")) {
      errorMessage = "Your Gemini API Key has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.";
      console.warn("COWORK CHAT QUOTA REACHED: ", errorMessage); // Log as warn, no stack trace
    } else if (fullErrorStr.includes("API key not valid") || fullErrorStr.includes("MY_GEMINI_API_KEY")) {
      errorMessage = "Your Gemini API Key is invalid or set to a placeholder. Please provide a valid Gemini API key in the AI Studio Settings menu under secrets (GEMINI_API_KEY) and refresh.";
      console.warn("COWORK CHAT INVALID KEY: ", errorMessage);
    } else if (fullErrorStr.includes("503") || fullErrorStr.includes("UNAVAILABLE") || fullErrorStr.includes("high demand")) {
      errorMessage = "The AI model is currently experiencing high demand and is temporarily unavailable. Please try again in a few moments.";
      console.warn("COWORK CHAT SERVICE UNAVAILABLE: ", errorMessage);
    } else {
      console.error("COWORK CHAT ERROR: ", error); // Only log full trace for unexpected errors
    }
    
    res.status(500).json({ error: errorMessage });
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
