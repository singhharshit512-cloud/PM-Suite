import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const sourceDb = getFirestore(app, "ai-studio-8c800e48-0f5f-41de-abce-b89bf0dab6dc");
const targetDb = getFirestore(app, "pmsuitedatabase");

const collectionsToMigrate = [
  'users',
  'meetings',
  'notes',
  'tasks',
  'chats',
  'feedback',
  'adminUsers',
  'adminAuditLog',
  'adminConfig',
  'userRoles',
  'userQuotas' // we can probably ignore this one, but let's copy anyway
];

async function migrateData() {
  console.log("Starting DB migration...");
  try {
    for (const collectionName of collectionsToMigrate) {
      console.log(`Migrating collection: ${collectionName}`);
      const snapshot = await sourceDb.collection(collectionName).get();
      
      let count = 0;
      for (const doc of snapshot.docs) {
        await targetDb.collection(collectionName).doc(doc.id).set(doc.data());
        count++;
        
        // Check for subcollections (specifically messages under chats)
        if (collectionName === 'chats') {
          const messagesSnap = await sourceDb.collection(`chats/${doc.id}/messages`).get();
          for (const msgDoc of messagesSnap.docs) {
            await targetDb.collection(`chats/${doc.id}/messages`).doc(msgDoc.id).set(msgDoc.data());
          }
        }
      }
      console.log(`- Copied ${count} documents from ${collectionName}`);
    }
    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

migrateData();
