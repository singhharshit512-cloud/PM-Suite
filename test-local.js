async function run() {
  const res = await fetch('http://localhost:3000/api/debug/bots');
  const data = await res.json();
  console.log(JSON.stringify(data.results[0], null, 2));
}
run();
