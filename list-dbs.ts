import { google } from 'googleapis';

async function listDbs() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'),
      scopes: ['https://www.googleapis.com/auth/datastore']
    });

    const client = await auth.getClient();
    const projectId = "gen-lang-client-0369386229"; // from config
    const res = await client.request({
      url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases`
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e) {
    console.error(e);
  }
}
listDbs();
