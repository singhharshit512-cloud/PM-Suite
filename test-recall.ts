import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const botId = "a5bb3ed2-f693-431a-9926-ff7f641f2114";
  const botResponse = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/`, {
      headers: { 'Authorization': `Token ${process.env.RECALL_API_KEY}` }
  });
  const botData: any = await botResponse.json();

  let transcriptId = null;
  if (botData.recordings && Array.isArray(botData.recordings)) {
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
      const metadata: any = await transcriptResponse.json();
      if (metadata?.data?.download_url) {
         const actualDataRes = await fetch(metadata.data.download_url);
         transcriptData = await actualDataRes.json();
      } else {
         transcriptData = metadata;
      }
    } else {
      console.log("Error in transcript API");
    }
  } else {
    console.log("No transcript artifact ID found in recordings.");
  }

  let actualTranscriptArray = transcriptData;
  if (transcriptData && !Array.isArray(transcriptData)) { 
     actualTranscriptArray = transcriptData.parts || transcriptData.results || transcriptData.data || [];
  }

  if (Array.isArray(actualTranscriptArray) && actualTranscriptArray.length > 0) {
    rawTranscript = actualTranscriptArray.map((t: any) => {
      const speakerName = t.speaker || t.participant?.name || 'Unknown';
      const words = t.words?.map((w:any) => w.text).join('') || t.text || '';
      return `${speakerName}: ${words}`;
    }).join('\n');
    console.log("MAPPED TRANSCRIPT:\n", rawTranscript.substring(0, 500));
  } else {
    console.log("FAILED to map transcript array.");
  }

}
run();
