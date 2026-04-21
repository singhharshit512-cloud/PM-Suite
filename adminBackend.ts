import express from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ override: true });

export const adminRouter = express.Router();

let projectId = process.env.VITE_FIREBASE_PROJECT_ID;
let databaseId = '';

try {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  if (!projectId) {
     projectId = config.projectId;
  }
  databaseId = config.firestoreDatabaseId || '';
  
  if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
        projectId: projectId,
      });
    } else {
      console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT_KEY is missing. Application Default Credentials will be used, which typically do not have Firestore permissions in the AI Studio preview environment. Please add your service account JSON string to the secrets.");
      initializeApp({
        projectId: projectId,
      });
    }
  }
} catch (e) {
  console.error("Firebase Admin initialization error", e);
}

export const db = databaseId ? getFirestore(getApp(), databaseId) : getFirestore();

// Helpers
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'super_secret_jwt_key_must_be_changed_in_prod';
const getWhitelist = () => (process.env.ADMIN_WHITELIST || '').split(',').map(e => e.trim().toLowerCase());

// Utility to generate dynamic OAuth client based on request host
const getDynamicOauthClient = (req: express.Request) => {
  let host = process.env.APP_URL;
  if (!host) {
    const forwardedHost = req.headers['x-forwarded-host'];
    if (forwardedHost) {
      host = `https://${Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost}`;
    } else {
      host = `https://${req.get('host')}`;
    }
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${host}/api/admin/auth/callback`
  );
};

const logAdminAction = async (adminId: string, action: string, target: string, ip: string, diff?: any) => {
  try {
    await db.collection('adminAuditLog').add({
      adminId,
      action,
      target,
      timestamp: FieldValue.serverTimestamp(),
      ip,
      diff: diff || null
    });
  } catch (e) {
    console.error("Audit log failed", e);
  }
};

// Middleware
export const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string, adminId: string };
    if (decoded.role !== 'superadmin' && decoded.role !== 'orgAdmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    (req as any).admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

adminRouter.get('/auth/url', (req, res) => {
  const client = getDynamicOauthClient(req);
  const url = client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['https://www.googleapis.com/auth/userinfo.email']
  });
  res.json({ url });
});

adminRouter.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const client = getDynamicOauthClient(req);
    const { tokens } = await client.getToken(code as string);
    client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email?.toLowerCase();

    if (!email || !getWhitelist().includes(email)) {
      return res.status(403).send('<html><body><h2>Access Denied</h2><p>Your email is not on the admin whitelist.</p></body></html>');
    }

    // Check if user exists in adminUsers
    const adminRef = db.collection('adminUsers').where('email', '==', email);
    let snapshot;
    try {
      snapshot = await adminRef.get();
    } catch (dbErr: any) {
      if (dbErr.message.includes('PERMISSION_DENIED')) {
          return res.status(500).send(`
            <html><body>
              <h2>Firebase Admin Configuration Required</h2>
              <p>The backend server does not have permission to read the Firestore database.</p>
              <p>To fix this, you must:</p>
              <ol>
                <li>Go to the <a href="https://console.firebase.google.com/" target="_blank">Firebase Console</a></li>
                <li>Open your project settings and click on the <b>Service accounts</b> tab</li>
                <li>Click <b>Generate new private key</b> and download the JSON file</li>
                <li>Open the Secrets menu in AI Studio and create a new secret named <code>FIREBASE_SERVICE_ACCOUNT_KEY</code></li>
                <li>Paste the ENTIRE contents of the downloaded JSON file into that secret and save</li>
              </ol>
            </body></html>
          `);
      }
      throw dbErr;
    }
    
    let adminUid = '';
    let hasTotp = false;
    let totpSecret = '';
    if (snapshot.empty) {
      // First time admin login
      totpSecret = authenticator.generateSecret();
      const doc = await db.collection('adminUsers').add({
        email,
        totpSecret,
        role: 'superadmin',
        createdAt: FieldValue.serverTimestamp()
      });
      adminUid = doc.id;
    } else {
      adminUid = snapshot.docs[0].id;
      const data = snapshot.docs[0].data();
      totpSecret = data.totpSecret;
      hasTotp = !!data.totpEnabled;
    }

    // We can't immediately issue JWT, we need TOTP step. 
    // We'll issue a temporary JWT just for MFA verification
    const tempToken = jwt.sign({ adminId: adminUid, email, totpSecret, hasTotp }, JWT_SECRET, { expiresIn: '15m' });
    res.cookie('admin_temp_token', tempToken, { httpOnly: true });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'ADMIN_OAUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/admin?mfa=true';
            }
          </script>
          <p>Login step 1 complete. Redirecting...</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Admin auth callback error:', err);
    res.status(500).send('Authentication failed: ' + err.message + ' ' + JSON.stringify(err.response?.data || {}));
  }
});

adminRouter.post('/auth/mfa/verify', async (req, res) => {
  const { code } = req.body;
  const tempToken = req.cookies.admin_temp_token;
  if (!tempToken) return res.status(401).json({ error: 'No active login session' });

  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET) as any;
    const isValid = authenticator.check(code, decoded.totpSecret);
    
    if (!isValid) return res.status(401).json({ error: 'Invalid MFA code' });

    if (!decoded.hasTotp) {
       await db.collection('adminUsers').doc(decoded.adminId).update({ totpEnabled: true });
    }

    const token = jwt.sign({ adminId: decoded.adminId, role: 'superadmin' }, JWT_SECRET, { expiresIn: '4h' });
    res.cookie('admin_token', token, { httpOnly: true });
    res.clearCookie('admin_temp_token');

    await logAdminAction(decoded.adminId, 'login', decoded.email, req.ip || 'unknown');

    res.json({ success: true, role: 'superadmin' });
  } catch (e) {
    res.status(401).json({ error: 'Verification failed' });
  }
});

adminRouter.get('/auth/mfa/setup', (req, res) => {
  const tempToken = req.cookies.admin_temp_token;
  if (!tempToken) return res.status(401).json({ error: 'No active login session' });

  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET) as any;
    if (decoded.hasTotp) {
        return res.json({ secret: null, hasTotp: true });
    }
    const otpauth = authenticator.keyuri(decoded.email, 'PM_Suite_Admin', decoded.totpSecret);
    res.json({ secret: decoded.totpSecret, otpauth, hasTotp: false });
  } catch (e) {
    res.status(401).json({ error: 'Verification failed' });
  }
});

adminRouter.post('/auth/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

// Admin config routes
adminRouter.get('/config/cowork', requireAdmin, async (req, res) => {
  try {
    const promptDoc = await db.collection('adminConfig').doc('coworkSystemPrompt').get();
    const templatesDoc = await db.collection('adminConfig').doc('docTemplates').get();
    const modelsDoc = await db.collection('adminConfig').doc('modelSettings').get();

    res.json({
      prompt: promptDoc.exists ? promptDoc.data()?.current : '',
      promptVersions: promptDoc.exists ? promptDoc.data()?.versions || [] : [],
      templates: templatesDoc.exists ? templatesDoc.data()?.templates || [] : [],
      modelSettings: modelsDoc.exists ? modelsDoc.data() : { temperature: 0.7, maxTokens: 4000, topP: 0.95, topK: 64, dailyQuotaPerUser: 50 }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

adminRouter.put('/config/cowork/prompt', requireAdmin, async (req, res) => {
  const { prompt } = req.body;
  const adminId = (req as any).admin.adminId;
  
  try {
    const docRef = db.collection('adminConfig').doc('coworkSystemPrompt');
    const doc = await docRef.get();
    let versions = [];
    if (doc.exists) {
      versions = doc.data()?.versions || [];
      if (doc.data()?.current) {
         versions.unshift({
           prompt: doc.data()?.current,
           savedAt: new Date().toISOString(),
           savedBy: adminId
         });
         if (versions.length > 10) versions = versions.slice(0, 10);
      }
    }
    await docRef.set({
      current: prompt,
      versions
    }, { merge: true });

    await logAdminAction(adminId, 'update_cowork_prompt', 'adminConfig/coworkSystemPrompt', req.ip || '');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

adminRouter.post('/cowork/test', requireAdmin, async (req, res) => {
  const { prompt, message } = req.body;
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-goog-api-key': process.env.GEMINI_API_KEY || ''
       },
       body: JSON.stringify({
         contents: [{ role: 'user', parts: [{ text: message }] }],
         systemInstruction: { parts: [{ text: prompt }] }
       })
    });
    if (!response.ok) {
        throw new Error("Gemini API error");
    }
    const data = await response.json();
    res.json({ text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' });
  } catch (e) {
    res.status(500).json({ error: 'Test completion failed' });
  }
});

adminRouter.put('/config/cowork/templates', requireAdmin, async (req, res) => {
  const { templates } = req.body;
  const adminId = (req as any).admin.adminId;
  try {
    await db.collection('adminConfig').doc('docTemplates').set({ templates });
    await logAdminAction(adminId, 'update_cowork_templates', 'adminConfig/docTemplates', req.ip || '');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save templates' });
  }
});

adminRouter.put('/config/model', requireAdmin, async (req, res) => {
  const { temperature, maxTokens, topP, topK, dailyQuotaPerUser } = req.body;
  const adminId = (req as any).admin.adminId;
  try {
    await db.collection('adminConfig').doc('modelSettings').set({
      temperature, maxTokens, topP, topK, dailyQuotaPerUser
    });
    await logAdminAction(adminId, 'update_model_settings', 'adminConfig/modelSettings', req.ip || '');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save model settings' });
  }
});

// User management
adminRouter.get('/users', requireAdmin, async (req, res) => {
  try {
    const listUsersResult = await getAuth().listUsers();
    
    // Get roles
    const rolesSnapshot = await db.collection('userRoles').get();
    const rolesMap: Record<string, string> = {};
    rolesSnapshot.forEach(doc => {
      rolesMap[doc.id] = doc.data().role;
    });

    const users = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
      disabled: user.disabled,
      role: rolesMap[user.uid] || 'member'
    }));
    
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

adminRouter.patch('/users/:uid', requireAdmin, async (req, res) => {
  const { uid } = req.params;
  const { role, disabled } = req.body;
  const adminId = (req as any).admin.adminId;

  try {
    if (disabled !== undefined) {
      await getAuth().updateUser(uid, { disabled });
      await logAdminAction(adminId, disabled ? 'suspend_user' : 'reactivate_user', uid, req.ip || '');
    }
    
    if (role !== undefined) {
      await db.collection('userRoles').doc(uid).set({ role });
      await logAdminAction(adminId, 'change_user_role', uid, req.ip || '', { newRole: role });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

adminRouter.post('/users/invite', requireAdmin, async (req, res) => {
   const { email, role } = req.body;
   // In a real app we would use Firebase dynamic links or send a custom email.
   res.json({ success: true, message: 'Invitation would be sent via email.' });
});

// Audit and Usage
adminRouter.get('/audit', requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('adminAuditLog').orderBy('timestamp', 'desc').limit(50).get();
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp?.toDate() }));
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

adminRouter.get('/stats', requireAdmin, async (req, res) => {
  try {
    // Quick summary
    const users = await getAuth().listUsers();
    
    // Total open tasks
    const tasks = await db.collection('tasks').where('status', '==', 'open').get();
    
    res.json({
      totalUsers: users.users.length,
      openTasks: tasks.size,
      botSessionsThisWeek: Math.floor(Math.random() * 10), // mock
      aiQuotaUsedToday: Math.floor(Math.random() * 100), // mock
      activeOrgs: 1 // mock
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

adminRouter.get('/system/status', requireAdmin, async (req, res) => {
  try {
    const modelsDoc = await db.collection('adminConfig').doc('modelSettings').get();
    const defaultModel = modelsDoc.exists ? modelsDoc.data()?.defaultModel : 'gemini-2.5-flash';

    res.json({
      google: {
        connected: !!process.env.GOOGLE_CLIENT_ID,
        clientId: process.env.GOOGLE_CLIENT_ID || 'Missing',
      },
      gemini: {
        connected: !!process.env.GEMINI_API_KEY,
        apiKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10).padEnd(30, '.') : 'Missing',
        defaultModel
      },
      firebase: {
        connected: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        projectId: projectId,
        authType: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'Service Account' : 'Application Default'
      },
      recall: {
        connected: !!process.env.RECALL_API_KEY,
        apiKeyPrefix: process.env.RECALL_API_KEY ? process.env.RECALL_API_KEY.substring(0, 5).padEnd(20, '.') : 'Missing'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/system/usage', requireAdmin, async (req, res) => {
  try {
    const usersSnap = await db.collection('userRoles').get();
    const activeUsers = usersSnap.size;

    const quotesSnap = await db.collection('userQuotas').get();
    let totalMessages = 0;
    quotesSnap.forEach(doc => {
       totalMessages += doc.data().count || 0;
    });

    const meetingsSnap = await db.collection('meetings').get();
    const totalMeetings = meetingsSnap.size;

    // Generate last 7 days
    const tokenData = [];
    const meetingData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      tokenData.push({ date: dateStr, input: 0, output: 0 }); // We don't store historical token telemetry yet
      meetingData.push({ date: dateStr, duration: 0, _date: new Date(d.setHours(0,0,0,0)) });
    }

    // Aggregate meetings
    meetingsSnap.forEach(doc => {
      const data = doc.data();
      if (data.date) {
        const mDate = data.date.toDate ? data.date.toDate() : new Date(data.date);
        const mDateStr = mDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const dayIdx = meetingData.findIndex(md => md.date === mDateStr);
        if (dayIdx !== -1) {
          // Approximate 30 mins per meeting if duration isn't explicitly set
          meetingData[dayIdx].duration += 30; 
        }
      }
    });

    res.json({
      metrics: {
        activeUsers,
        totalMessages,
        totalMeetings
      },
      tokenData,
      meetingData: meetingData.map(({date, duration}) => ({date, duration}))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/auth/me', requireAdmin, (req, res) => {
  res.json({ success: true, ...((req as any).admin) });
});

adminRouter.get('/logs', requireAdmin, async (req, res) => {
  try {
    const { level, module, userId, route, startDate, endDate, cursor, limit: limitParam } = req.query;
    let limit = Math.min(parseInt((limitParam as string) || '50', 10), 200);

    let query: any = db.collection('platformLogs').orderBy('timestamp', 'desc');

    if (level) query = query.where('level', '==', level);
    if (module) query = query.where('module', '==', module);
    if (userId) query = query.where('userId', '==', userId);
    if (route) query = query.where('route', '==', route);
    
    if (startDate) {
      query = query.where('timestamp', '>=', new Date(startDate as string));
    }
    if (endDate) {
      query = query.where('timestamp', '<=', new Date(endDate as string));
    }

    if (cursor) {
      const cursorDoc = await db.collection('platformLogs').doc(cursor as string).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit).get();
    const logs = snapshot.docs.map(doc => {
       const data = doc.data();
       let tsStr = null;
       if (data.timestamp?.toDate) {
          tsStr = data.timestamp.toDate().toISOString();
       } else if (typeof data.timestamp === 'string') {
          tsStr = data.timestamp;
       }
       return { id: doc.id, ...data, timestamp: tsStr };
    });
    
    res.json({
       logs,
       nextCursor: logs.length === limit ? logs[logs.length - 1].id : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/logs/stats', requireAdmin, async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // To keep it simple, we can query recent logs. But for full accurate stats, we should aggregate.
    // However, Firestore doesn't support complex aggregations easily without limit, so we fetch last 500 for P99 
    // and use count() queries for total/error/warn today.

    const todayQuery = db.collection('platformLogs').where('timestamp', '>=', startOfDay);
    const errQuery = todayQuery.where('level', '==', 'ERROR');
    const warnQuery = todayQuery.where('level', '==', 'WARN');

    const [totalSnap, errSnap, warnSnap] = await Promise.all([
      todayQuery.count().get(),
      errQuery.count().get(),
      warnQuery.count().get()
    ]);

    const totalToday = totalSnap.data().count;
    const errorsToday = errSnap.data().count;
    const warningsToday = warnSnap.data().count;

    // Check for error spike (last 5 min)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentErrSnap = await db.collection('platformLogs')
       .where('timestamp', '>=', fiveMinAgo)
       .where('level', '==', 'ERROR')
       .count().get();
    
    const recentErrors = recentErrSnap.data().count;
    let errorSpike = recentErrors > 10;
    
    if (errorSpike) {
       await db.collection('adminAlerts').add({
           message: `Error spike detected: ${recentErrors} errors in last 5 minutes.`,
           timestamp: FieldValue.serverTimestamp(),
           dismissedAt: null
       });
    }

    // Error array for sparkbar (last 24 hours, grouped by hour)
    // We just fetch the error logs from the last 24h. If > 1000 we limit and approximate.
    const last24hErrors = await db.collection('platformLogs')
       .where('timestamp', '>=', twentyFourHoursAgo)
       .where('level', '==', 'ERROR')
       .limit(1000).get();

    const sparkbar = Array(24).fill(0);
    const now = Date.now();
    last24hErrors.forEach(doc => {
       const ts = doc.data().timestamp?.toDate()?.getTime();
       if (ts) {
          const hourDiff = Math.floor((now - ts) / (60 * 60 * 1000));
          if (hourDiff >= 0 && hourDiff < 24) {
             sparkbar[23 - hourDiff]++;
          }
       }
    });

    // P50, P95, P99 calculations (from last 500 logs)
    const recentLogs = await db.collection('platformLogs').orderBy('timestamp', 'desc').limit(500).get();
    const routeLatencies: Record<string, number[]> = {};
    recentLogs.forEach(doc => {
       const d = doc.data();
       if (d.route && d.latencyMs != null) {
          if (!routeLatencies[d.route]) routeLatencies[d.route] = [];
          routeLatencies[d.route].push(d.latencyMs);
       }
    });

    const routeStats = Object.keys(routeLatencies).map(route => {
       const latencies = routeLatencies[route].sort((a, b) => a - b);
       const len = latencies.length;
       return {
          route,
          p50: latencies[Math.floor(len * 0.50)],
          p95: latencies[Math.floor(len * 0.95)],
          p99: latencies[Math.floor(len * 0.99)],
       };
    }).sort((a,b) => b.p99 - a.p99);

    res.json({
       totalToday,
       errorsToday,
       warningsToday,
       sparkbar,
       errorSpike,
       routeStats
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/logs/export', requireAdmin, async (req, res) => {
  try {
     const { startDate, endDate, level, module } = req.query;
     res.setHeader('Content-Type', 'application/x-ndjson');
     res.setHeader('Content-Disposition', 'attachment; filename="logs-export.ndjson"');

     let query: any = db.collection('platformLogs').orderBy('timestamp', 'desc');

     if (level) query = query.where('level', '==', level);
     if (module) query = query.where('module', '==', module);
     if (startDate) query = query.where('timestamp', '>=', new Date(startDate as string));
     if (endDate) query = query.where('timestamp', '<=', new Date(endDate as string));
     
     // Note: Firestore stream() is better for this but we can use limit + pagination for safety
     // Since this is a test environment we will just export top 1000
     const snapshot = await query.limit(1000).get();
     snapshot.forEach((doc: any) => {
        res.write(JSON.stringify({id: doc.id, ...doc.data()}) + '\n');
     });
     res.end();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/logs/user/:userId', requireAdmin, async (req, res) => {
  try {
     const snapshot = await db.collection('platformLogs')
       .where('userId', '==', req.params.userId)
       .where('timestamp', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
       .orderBy('timestamp', 'desc')
       .limit(100)
       .get();
     const logs = snapshot.docs.map(doc => {
       const data = doc.data();
       let tsStr = null;
       if (data.timestamp?.toDate) {
          tsStr = data.timestamp.toDate().toISOString();
       } else if (typeof data.timestamp === 'string') {
          tsStr = data.timestamp;
       }
       return { id: doc.id, ...data, timestamp: tsStr };
     });
     res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/logs/:traceId', requireAdmin, async (req, res) => {
  try {
     const snapshot = await db.collection('platformLogs')
       .where('traceId', '==', req.params.traceId)
       .orderBy('timestamp', 'asc')
       .get();
     const logs = snapshot.docs.map(doc => {
       const data = doc.data();
       let tsStr = null;
       if (data.timestamp?.toDate) {
          tsStr = data.timestamp.toDate().toISOString();
       } else if (typeof data.timestamp === 'string') {
          tsStr = data.timestamp;
       }
       return { id: doc.id, ...data, timestamp: tsStr };
     });
     res.json({ logs });
  } catch (err: any) {
     res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/health', requireAdmin, async (req, res) => {
   // Simulated health check for Gemini, Recall, Google, Firestore
   res.json({
      gemini: { status: 'healthy', lastSuccess: new Date().toISOString(), errorRate1h: 0.1, avgLatency: 850 },
      recall: { status: 'healthy', lastSuccess: new Date().toISOString(), errorRate1h: 0.0, avgLatency: 300 },
      google: { status: 'healthy', lastSuccess: new Date().toISOString(), errorRate1h: 0.5, avgLatency: 450 },
      firestore: { status: 'healthy', lastSuccess: new Date().toISOString(), errorRate1h: 0.0, avgLatency: 50 },
   });
});
