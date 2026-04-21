import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const botId = "a5bb3ed2-f693-431a-9926-ff7f641f2114";
  const res = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/transcript`, {
    headers: { 'Authorization': `Token ${process.env.RECALL_API_KEY}` }
  });
  console.log("Status:", res.status);
  const data = await res.text();
  console.log("Data snippet:", data.substring(0, 500));
}
run();
