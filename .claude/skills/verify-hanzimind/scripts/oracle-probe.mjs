#!/usr/bin/env node
// Ask one unauthenticated auth endpoint the same question twice — once about an
// address nobody holds, once about an address that has an account — and report
// whether the two answers can be told apart, by body, by headers or by clock.
//
//   oracle-probe.mjs --port 3007 --endpoint sign-up --n 50
//
// Endpoints: sign-up, password-reset, send-verification, sign-in.
//
// --pad <chars> inflates the one caller-controlled field that only one of the
// two paths goes on to process, which is how a fixed response-time bucket gets
// broken. Run it at the largest input the server accepts and one character past
// it; both must keep the two kinds in the same bucket, the second by refusing
// them identically. See the ENDPOINTS table for which field that is per route.
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
const pad = Number(args.get("pad") ?? 0);
const quantum = Number(args.get("quantum") ?? 750);
const control = args.has("control");
const json = args.has("json");
if (!port || !n) {
  console.error(
    "usage: oracle-probe.mjs --port <p> [--endpoint sign-up|password-reset|send-verification|sign-in]\n" +
      "                       [--n 50] [--taken <email>] [--pad <chars>] [--quantum 750] [--control] [--json]",
  );
  process.exit(2);
}

const base = `http://localhost:${port}`;
const freeAddress = () =>
  `oracle-free-${Math.random().toString(36).slice(2, 12)}@hanzimind.test`;

/**
 * Each entry answers three things: which path do we POST to, what does a
 * request about this address look like, and which field is the LEVER — the
 * caller-controlled string that only one of the two paths goes on to process.
 *
 * The lever is what `--pad` inflates, and it is the whole reason this mode
 * exists. A fixed response-time bucket hides two paths from each other only
 * while both fit inside it, and the lever is how a caller pushes one of them
 * out. On sign-up it is `name`: a free address has it rendered into a
 * verification email, a taken address does not. Padding it to 4 MB once put the
 * free path in its third bucket and the taken path in its first — disjoint
 * distributions from one request per address. A probe that only ever sends a
 * small body tests the implementation and not the assumption underneath it.
 *
 * `free` is called per iteration because a free address only stays free until
 * it has been asked about once.
 */
const ENDPOINTS = {
  "sign-up": {
    path: "/api/auth/sign-up/email",
    lever: "name",
    prefix: "",
    body: (email, lever) => ({
      name: lever ?? "Oracle Probe",
      email,
      password,
      callbackURL: "/verified",
    }),
  },
  "password-reset": {
    path: "/api/auth/request-password-reset",
    lever: "redirectTo",
    // The padded value still has to be a same-origin URL, or better-auth's
    // origin check refuses it before the cost it is meant to buy is ever paid.
    prefix: `${base}/reset-password?p=`,
    body: (email, lever) => ({
      email,
      redirectTo: lever ?? `${base}/reset-password`,
    }),
  },
  "send-verification": {
    path: "/api/auth/send-verification-email",
    lever: "callbackURL",
    prefix: "/verified?p=",
    body: (email, lever) => ({ email, callbackURL: lever ?? "/verified" }),
  },
  // The pair here is "no such account" against "account exists, wrong
  // password". Both are meant to be the same 401. Its lever is nominal: this
  // route is not levelled, both branches hash, and neither renders anything.
  "sign-in": {
    path: "/api/auth/sign-in/email",
    lever: "callbackURL",
    prefix: "/verified?p=",
    body: (email, lever) => ({
      email,
      password,
      ...(lever ? { callbackURL: lever } : {}),
    }),
  },
};
const spec = ENDPOINTS[endpoint];
if (!spec) {
  console.error(`unknown endpoint ${endpoint}`);
  process.exit(2);
}
if (pad > 0 && pad < spec.prefix.length) {
  console.error(
    `--pad must be at least ${spec.prefix.length} for ${endpoint}: ${spec.lever} has to keep the prefix "${spec.prefix}" to reach the code being measured`,
  );
  process.exit(2);
}

// `--pad N` means the lever field is exactly N characters, prefix included, so
// that "at the bound" and "one past it" are the two runs the server's own limit
// names rather than two numbers that happen to be near it.
const padding = pad > 0 ? "A".repeat(pad - spec.prefix.length) : null;
const lever = padding === null ? null : `${spec.prefix}${padding}`;

/**
 * Blank out everything a response is entitled to differ in — the generated id,
 * the address that was asked about, the clock, and the padding a `--pad` run
 * echoes back — so that what is left is the shape, and two shapes that differ
 * are a leak.
 */
const canonical = (text, email) => {
  const withoutPadding = padding ? text.split(padding).join("<pad>") : text;
  return withoutPadding
    .split(email)
    .join("<address>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<timestamp>")
    .replace(/"id":"[^"]*"/g, '"id":"<id>"');
};

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
    body: JSON.stringify(spec.body(email, lever)),
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

/**
 * What the second arm asks about.
 *
 * `--control` points it at a fresh address too, so the run compares free
 * against free and every millisecond it reports is this machine's own noise at
 * this body size. That number is the bar a real finding has to clear, and
 * without it a padded run cannot tell a leak from a GC pause: an 8 ms gap on a
 * 4 MB body looked like a finding until the control put the floor at the same
 * 8 ms. Run the control whenever a padded comparison reports a gap.
 */
const secondArm = () => (control ? freeAddress() : taken);

// One warm pair first: the dev server compiles a route on its first request,
// and whichever kind went first would otherwise carry the whole compile.
await call(freeAddress());
await call(secondArm());

for (let i = 0; i < n; i++) {
  // Alternate which kind leads, so a per-pair ordering cost lands on both.
  if (i % 2 === 0) {
    record("free", await call(freeAddress()));
    record("taken", await call(secondArm()));
  } else {
    record("taken", await call(secondArm()));
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
    // Which multiple of the quantum each call landed on. This is the assumption
    // the whole scheme rests on, so it is reported rather than inferred: two
    // paths in one bucket are indistinguishable, two paths in different buckets
    // are a one-request oracle however close the medians look on a graph.
    buckets: [...new Set(sorted.map((ms) => Math.ceil(ms / quantum)))].sort(
      (a, b) => a - b,
    ),
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
const sameBuckets =
  JSON.stringify(free.buckets) === JSON.stringify(takenSummary.buckets);

if (json) {
  console.log(
    JSON.stringify(
      { endpoint, pad, quantum, free, taken: takenSummary, gap, gapPercent },
      null,
      2,
    ),
  );
} else {
  const line = (s) =>
    `${s.kind.padEnd(5)} n ${s.n}  ${Object.entries(s.statuses)
      .map(([code, count]) => `${code}x${count}`)
      .join(" ")}  p50 ${s.p50} ms  p95 ${s.p95} ms  max ${s.max} ms  bucket ${s.buckets.map((b) => `x${b}`).join(",")}`;
  console.log(
    `endpoint ${endpoint}  ${spec.path}` +
      (pad ? `  ${spec.lever} padded to ${pad} chars` : "") +
      (control ? "  CONTROL: both arms are free addresses" : ""),
  );
  console.log(line(free));
  console.log(line(takenSummary));
  console.log(
    `median gap ${gap} ms (${gapPercent.toFixed(1)}% of the smaller median)`,
  );
  console.log(`status   ${sameStatus ? "identical" : "DIFFERENT"}`);
  console.log(`headers  ${sameHeaders ? "identical" : "DIFFERENT"}`);
  console.log(`body     ${sameBody ? "identical" : "DIFFERENT"}`);
  console.log(
    `buckets  ${sameBuckets ? "identical" : "DIFFERENT"} (quantum ${quantum} ms)`,
  );
  // The 10% rule is meaningful against a 750 ms bucket and close to meaningless
  // against a 20 ms rejection, where 10% is two milliseconds of jitter. When
  // the only thing separating the two kinds is the median, say so rather than
  // let the exit code imply more than it knows.
  if (sameBody && sameHeaders && sameStatus && sameBuckets && gapPercent > 10) {
    console.log(
      !control
        ? "note     only the median separates them. Re-run with --control to see this machine's floor at this body size before believing it."
        : "note     this IS the control, so that gap is the floor, not a finding.",
    );
  }
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
// Buckets are checked separately from the median gap because they catch a
// different failure: two runs 194% apart show up in both, but a run that
// straddles a boundary can hold its medians close while a single request still
// sorts the two kinds.
process.exit(
  sameBody && sameHeaders && sameStatus && sameBuckets && gapPercent <= 10
    ? 0
    : 1,
);
