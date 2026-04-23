import { google } from 'googleapis';

async function createDb() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'),
      scopes: ['https://www.googleapis.com/auth/datastore']
    });

    const client = await auth.getClient();
    const projectId = "gen-lang-client-0369386229"; // from config
    const res = await client.request({
      method: 'POST',
      url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`,
      data: {
        type: 'FIRESTORE_NATIVE',
        locationId: 'us-west1',
        databaseEdition: 'ENTERPRISE',
        freeTier: false
      }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e: any) {
    console.error(e.response ? e.response.data : e);
  }
}
createDb();
