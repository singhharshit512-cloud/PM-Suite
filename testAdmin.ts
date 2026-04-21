import { initializeApp, applicationDefault, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
initializeApp({
  credential: applicationDefault(),
  projectId: config.projectId
});
const db = getFirestore(getApp(), config.firestoreDatabaseId);

db.collection('adminUsers').get()
  .then((snap) => console.log("SUCCESS:", snap.size))
  .catch((e) => console.error("ERROR:", e));
