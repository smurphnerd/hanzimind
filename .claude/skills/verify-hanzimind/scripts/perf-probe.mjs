#!/usr/bin/env node
// Sign in as the seeded learner and time one RPC procedure N times.
// Usage: perf-probe.mjs --port 3001 --rpc vocab/search --body '{"query":"人","searchLanguage":"chinese","page":1,"pageSize":20}' --n 30

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const port = Number(args.get("port"));
const rpc = args.get("rpc");
const body = JSON.parse(args.get("body") ?? "{}");
const n = Number(args.get("n") ?? 30);
const email = args.get("email") ?? "verify@hanzimind.test";
const password = args.get("password") ?? "verify-hanzimind";
if (!port || !rpc || !n) {
  console.error(
    "usage: perf-probe.mjs --port <p> --rpc <router/procedure> --body <json> --n <count> [--email <e> --password <p>]",
  );
  process.exit(2);
}

const base = `http://localhost:${port}`;
const signIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email, password }),
});
if (!signIn.ok) {
  console.error(`sign-in failed: ${signIn.status} ${await signIn.text()}`);
  process.exit(1);
}
const cookie = signIn.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");

const durations = [];
const statuses = new Map();
for (let i = 0; i < n; i++) {
  const started = performance.now();
  const response = await fetch(`${base}/api/rpc/${rpc}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ json: body }),
  });
  await response.arrayBuffer();
  durations.push(performance.now() - started);
  statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
}

durations.sort((a, b) => a - b);
const percentile = (p) =>
  Math.round(durations[Math.min(durations.length - 1, Math.ceil((p / 100) * durations.length) - 1)]);
console.log(`rpc ${rpc} n ${n} statuses ${[...statuses].map(([s, c]) => `${s}x${c}`).join(" ")}`);
console.log(`p50 ${percentile(50)} ms`);
console.log(`p95 ${percentile(95)} ms`);
process.exit([...statuses.keys()].every((s) => s < 300) ? 0 : 1);
