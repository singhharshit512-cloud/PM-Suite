import fs from "fs";

async function run() {
  const apiKey = process.env.RECALL_API_KEY || "YOUR_KEY";
  console.log("Fetching bots...");
  const botRes = await fetch("https://us-west-2.recall.ai/api/v1/bot/", {
    headers: { Authorization: `Token ${apiKey}` }
  });
  if (!botRes.ok) {
    console.log(await botRes.text());
    return;
  }
  const botData = await botRes.json();
  const bot = botData.results[0]; // let's just get the first one
  if (!bot) {
    console.log("No bots");
    return;
  }
  
  console.log(JSON.stringify(bot, null, 2));
}

run();
