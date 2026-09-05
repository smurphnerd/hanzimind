#!/usr/bin/env node
// Ask one unauthenticated auth endpoint the same question twice — once about an
// address nobody holds, once about an address that has an account — and report
// whether the two answers can be told apart, by body, by headers or by clock.
//
//   oracle-probe.mjs --port 3007 --endpoint sign-up --n 50
//
// Endpoints: sign-up, password-reset, send-verification, sign-in.
//
// Why this exists rather than perf-probe.mjs: perf-probe signs in and calls one
// oRPC procedure with a fixed body, and none of that fits here. These are
// better-auth routes under /api/auth, not /api/rpc; every free-address call
// needs a fresh address, or the second one is a taken-address call; and the
// measurement is a COMPARISON of two request kinds, not one number.
//
// Requests are interleaved free/taken so that a machine speeding up or slowing
// down during the run moves both medians together instead of faking a gap, and
// each carries its own X-Forwarded-For so better-auth's per-IP rate limit never
// fires mid-run. (That header being enough to get a fresh bucket is better-
// auth's default IP resolution, not something this probe arranges.)

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const port = Number(args.get("port"));
const endpoint = args.get("endpoint") ?? "sign-up";
const n = Number(args.get("n") ?? 50);
const taken = args.get("taken") ?? "verify@hanzimind.test";
const password = args.get("password") ?? "oracle-probe-password";
const json = args.has("json");
if (!port || !n) {
  console.error(
    "usage: oracle-probe.mjs --port <p> [--endpoint sign-up|password-reset|send-verification|sign-in] [--n 50] [--taken <email>] [--json]",
  );
  process.exit(2);
}

const base = `http://localhost:${port}`;
const freeAddress = () =>
  `oracle-free-${Math.random().toString(36).slice(2, 12)}@hanzimind.test`;

/**
 * Each entry answers: which path do we POST to, and what does a request about
 * this address look like. `free` is called per iteration because a free address
 * only stays free until it has been asked about once.
 */
const ENDPOINTS = {
  "sign-up": {
    path: "/api/auth/sign-up/email",
    body: (email) => ({
      name: "Oracle Probe",
      email,
      password,
      callbackURL: "/verified",
    }),
  },
  "password-reset": {
    path: "/api/auth/request-password-reset",
    body: (email) => ({ email, redirectTo: `${base}/reset-password` }),
  },
  "send-verification": {
    path: "/api/auth/send-verification-email",
    body: (email) => ({ email, callbackURL: "/verified" }),
  },
  // The pair here is "no such account" against "account exists, wrong
  // password". Both are meant to be the same 401.
  "sign-in": {
    path: "/api/auth/sign-in/email",
    body: (email) => ({ email, password }),
  },
};
const spec = ENDPOINTS[endpoint];
if (!spec) {
  console.error(`unknown endpoint ${endpoint}`);
  process.exit(2);
}

/**
 * Blank out everything a response is entitled to differ in — the generated id,
 * the address that was asked about, the clock — so that what is left is the
 * shape, and two shapes that differ are a leak.
 */
const canonical = (text, email) =>
  text
    .split(email)
    .join("<address>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<timestamp>")
    .replace(/"id":"[^"]*"/g, '"id":"<id>"');

const HEADERS_THAT_COULD_TELL = [
  "content-type",
  "content-length",
  "cache-control",
  "set-cookie",
];
const headerFingerprint = (response) =>
  HEADERS_THAT_COULD_TELL.map((name) =>
    name === "set-cookie"
      ? `set-cookie:${response.headers
          .getSetCookie()
          .map((c) => c.split("=")[0])
          .sort()
          .join(",")}`
      : `${name}:${response.headers.get(name) ?? ""}`,
  ).join(" | ");

let forwarded = 0;
const call = async (email) => {
  forwarded += 1;
  const started = performance.now();
  const response = await fetch(`${base}${spec.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      // A fresh bucket per request, so the rate limit never colours the timing.
      "x-forwarded-for": `10.${(forwarded >> 16) & 255}.${(forwarded >> 8) & 255}.${forwarded & 255}`,
    },
    body: JSON.stringify(spec.body(email)),
  });
  const text = await response.text();
  return {
    ms: performance.now() - started,
    status: response.status,
    body: canonical(text, email),
    headers: headerFingerprint(response),
  };
};

const kinds = {
  free: { ms: [], statuses: new Map(), bodies: new Set(), headers: new Set() },
  taken: { ms: [], statuses: new Map(), bodies: new Set(), headers: new Set() },
};
const record = (kind, result) => {
  const bucket = kinds[kind];
  bucket.ms.push(result.ms);
  bucket.statuses.set(
    result.status,
    (bucket.statuses.get(result.status) ?? 0) + 1,
  );
  bucket.bodies.add(result.body);
  bucket.headers.add(result.headers);
};

// One warm pair first: the dev server compiles a route on its first request,
// and whichever kind went first would otherwise carry the whole compile.
await call(freeAddress());
await call(taken);

for (let i = 0; i < n; i++) {
  // Alternate which kind leads, so a per-pair ordering cost lands on both.
  if (i % 2 === 0) {
    record("free", await call(freeAddress()));
    record("taken", await call(taken));
  } else {
    record("taken", await call(taken));
    record("free", await call(freeAddress()));
  }
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const summary = (kind) => {
  const sorted = [...kinds[kind].ms].sort((a, b) => a - b);
  return {
    kind,
    n: sorted.length,
    statuses: Object.fromEntries(kinds[kind].statuses),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    // The whole point of a levelled endpoint is that no call escapes its
    // bucket, and one that did would hide behind a p95.
    max: Math.round(sorted[sorted.length - 1]),
    bodies: [...kinds[kind].bodies],
    headers: [...kinds[kind].headers],
  };
};
const free = summary("free");
const takenSummary = summary("taken");

// "Within 10 percent of each other" needs a denominator that does not flatter
// the bigger number, so the smaller median is the one to divide by.
const gap = Math.abs(free.p50 - takenSummary.p50);
const gapPercent = (gap / Math.min(free.p50, takenSummary.p50)) * 100;

const sameBody =
  free.bodies.length === 1 &&
  takenSummary.bodies.length === 1 &&
  free.bodies[0] === takenSummary.bodies[0];
const sameHeaders =
  free.headers.length === 1 &&
  takenSummary.headers.length === 1 &&
  free.headers[0] === takenSummary.headers[0];
const sameStatus =
  JSON.stringify(free.statuses) === JSON.stringify(takenSummary.statuses);

if (json) {
  console.log(
    JSON.stringify(
      { endpoint, free, taken: takenSummary, gap, gapPercent },
      null,
      2,
    ),
  );
} else {
  const line = (s) =>
    `${s.kind.padEnd(5)} n ${s.n}  ${Object.entries(s.statuses)
      .map(([code, count]) => `${code}x${count}`)
      .join(" ")}  p50 ${s.p50} ms  p95 ${s.p95} ms  max ${s.max} ms`;
  console.log(`endpoint ${endpoint}  ${spec.path}`);
  console.log(line(free));
  console.log(line(takenSummary));
  console.log(
    `median gap ${gap} ms (${gapPercent.toFixed(1)}% of the smaller median)`,
  );
  console.log(`status   ${sameStatus ? "identical" : "DIFFERENT"}`);
  console.log(`headers  ${sameHeaders ? "identical" : "DIFFERENT"}`);
  console.log(`body     ${sameBody ? "identical" : "DIFFERENT"}`);
  if (!sameBody || !sameHeaders) {
    console.log(`  free  body    ${free.bodies.join("\n              ")}`);
    console.log(
      `  taken body    ${takenSummary.bodies.join("\n              ")}`,
    );
    console.log(`  free  headers ${free.headers.join("\n              ")}`);
    console.log(
      `  taken headers ${takenSummary.headers.join("\n              ")}`,
    );
  }
}

// Exit 1 on anything that distinguishes the two, so a lane can assert on it.
process.exit(sameBody && sameHeaders && sameStatus && gapPercent <= 10 ? 0 : 1);
