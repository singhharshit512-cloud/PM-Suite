async function run() {
  const apiKey = process.env.RECALL_API_KEY; // wait, need to read it from server or local
  const botId = "555ffdb8-0edb-49c8-90fe-ab390c7f66d1";
  
  const transcriptId = "edbd5bd0-de3d-450c-971e-21c586af5269"; // From previous curl
  console.log("Fetching transcript ID", transcriptId);
  // Wait, I can't fetch it without API key unless I do it inside the server
}
run();
