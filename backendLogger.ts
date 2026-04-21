import { db } from './adminBackend.ts';
import { FieldValue } from 'firebase-admin/firestore';
import { Request, Response, NextFunction } from 'express';

export const generateTraceId = () => Math.random().toString(36).substring(2, 10);

function getModule(path: string): string {
  if (path.includes('/cowork')) return 'cowork';
  if (path.includes('/gemini-proxy') || path.includes('/bot')) return 'bot';
  if (path.includes('/admin')) return 'admin';
  if (path.includes('/auth')) return 'auth';
  if (path.includes('/drive')) return 'drive';
  if (path.includes('/tasks')) return 'tasks';
  if (path.includes('/calendar')) return 'calendar';
  return 'core';
}

export const writeLog = async (logData: any) => {
  try {
    const docRef = db.collection('platformLogs').doc();
    const logEntry = {
      ...logData,
      id: docRef.id,
      timestamp: FieldValue.serverTimestamp(),
    };
    await docRef.set(logEntry);
  } catch (e) {
    console.error("Logger error", e);
  }
};

export const logRequest = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const traceId = generateTraceId();
  (req as any).traceId = traceId;

  const originalSend = res.send;
  let responseBody = '';

  res.send = function (body) {
    responseBody = body;
    return originalSend.apply(this, arguments as any);
  };

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    let requestSummary = '';
    
    if (req.body && typeof req.body === 'object') {
       let safeBody = { ...req.body };
       delete safeBody.googleAccessToken;
       delete safeBody.googleRefreshToken;
       delete safeBody.token;
       delete safeBody.password;
       try { requestSummary = JSON.stringify(safeBody).substring(0, 200); } catch(e) {}
    }
    
    let resSummary = '';
    if (typeof responseBody === 'string') resSummary = responseBody.substring(0, 200);

    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    let userId = (req as any).body?.uid || (req as any).body?.userId || (req as any).query?.uid || (req as any).query?.userId || null;
    let userEmail = null;

    if (req.headers.authorization?.startsWith('Bearer ')) {
       try {
           const tokenStr = req.headers.authorization.split(' ')[1];
           const payloadStr = Buffer.from(tokenStr.split('.')[1], 'base64').toString();
           const payload = JSON.parse(payloadStr);
           if (!userId) userId = payload.user_id || payload.uid || null;
           if (payload.email) userEmail = payload.email;
       } catch (e) {}
    }

    if (req.cookies?.admin_token) {
       try {
           const payloadStr = Buffer.from(req.cookies.admin_token.split('.')[1], 'base64').toString();
           const payload = JSON.parse(payloadStr);
           if (!userId) userId = payload.uid || null;
           if (!userEmail && payload.email) userEmail = payload.email;
       } catch (e) {}
    }
    
    writeLog({
      level,
      module: getModule(req.path),
      route: req.path,
      method: req.method,
      userId,
      userEmail,
      ip: req.ip || '',
      statusCode: res.statusCode,
      latencyMs,
      requestSummary,
      responseSummary: resSummary,
      traceId,
      stackTrace: null,
      sessionId: null
    });
  });

  next();
};

export const logError = (err: any, req: Request, level = 'ERROR') => {
   const traceId = (req as any).traceId || generateTraceId();
   const statusCode = err.status || 500;
   
   let requestSummary = '';
   if (req.body && typeof req.body === 'object') {
     let safeBody = { ...req.body };
     delete safeBody.googleAccessToken;
     delete safeBody.googleRefreshToken;
     delete safeBody.token;
     delete safeBody.password;
     try { requestSummary = JSON.stringify(safeBody).substring(0, 200); } catch(e) {}
   }

   let userId = (req as any).body?.uid || (req as any).body?.userId || (req as any).query?.uid || (req as any).query?.userId || null;
   let userEmail = null;

   if (req.headers.authorization?.startsWith('Bearer ')) {
      try {
          const tokenStr = req.headers.authorization.split(' ')[1];
          const payloadStr = Buffer.from(tokenStr.split('.')[1], 'base64').toString();
          const payload = JSON.parse(payloadStr);
          if (!userId) userId = payload.user_id || payload.uid || null;
          if (payload.email) userEmail = payload.email;
      } catch (e) {}
   }

   if (req.cookies?.admin_token) {
      try {
          const payloadStr = Buffer.from(req.cookies.admin_token.split('.')[1], 'base64').toString();
          const payload = JSON.parse(payloadStr);
          if (!userId) userId = payload.uid || null;
          if (!userEmail && payload.email) userEmail = payload.email;
      } catch (e) {}
   }
   
   writeLog({
      level,
      module: getModule(req.path),
      route: req.path,
      method: req.method,
      userId,
      userEmail,
      ip: req.ip || '',
      statusCode,
      latencyMs: 0,
      requestSummary,
      responseSummary: String(err.message || err).substring(0, 200),
      traceId,
      stackTrace: err.stack || null,
      sessionId: null
   });
};
