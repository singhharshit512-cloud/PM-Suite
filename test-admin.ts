import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const targetDb = getFirestore(app, "pmsuitedatabase");

async function testConnection() {
  try {
    const snap = await targetDb.collection('users').limit(1).get();
    console.log("Success! Users found:", snap.size);
  } catch (error) {
    console.error("Connection failed:", error);
  }
}

testConnection();
