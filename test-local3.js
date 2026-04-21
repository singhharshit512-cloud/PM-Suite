async function run() {
  const apiKey = process.env.RECALL_API_KEY; 
  // Let's just hit the debug endpoint to get a bot's transcript
  const res = await fetch('http://localhost:3000/api/debug/bots');
  const data = await res.json();
  const bot = data.results[0];
  
  let transcriptId = null;
  if (bot.recordings && Array.isArray(bot.recordings)) {
    for (const recording of bot.recordings) {
      if (recording.media_shortcuts?.transcript?.id) {
        transcriptId = recording.media_shortcuts.transcript.id;
        break;
      }
    }
  }

  // To fetch it using API key, I'll need to create an endpoint in server
  console.log("Transcript ID: ", transcriptId);
}
run();
