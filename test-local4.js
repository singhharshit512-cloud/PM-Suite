async function run() {
  const botId = "a5bb3ed2-f693-431a-9926-ff7f641f2114";
  const res = await fetch(`http://localhost:3000/api/bot/${botId}/transcript`);
  const data = await res.json();
  console.log("Raw Data:", JSON.stringify(data.rawData, null, 2));
  console.log("Transcript extracted:", data.transcript);
}
run();
