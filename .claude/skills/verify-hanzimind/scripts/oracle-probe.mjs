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
// --concurrent <k> fires k requests at one address at once and compares the
// whole burst's signature. Sequential probing cannot see a channel that only
// opens when two requests overlap, and sign-up had one: its lookup and its
// insert are not atomic, so a burst at a free address collided on the unique
// index and answered 422 where a taken address always answered 200.
//
// --same-ip stops rotating X-Forwarded-For, which puts the rate limiter's own
// budget in play. Use it to check that no path spends more of that budget than
// the other; a burst that quietly costs an extra slot is the same oracle in a
// 429.
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

/**
 * Flags with a value, and flags without one.
 *
 * The obvious two-at-a-time loop is wrong and was wrong here: it made every
 * flag swallow the next token, so `--content --control` registered `content`
 * with the value "--control" and never registered `control` at all. A boolean
 * flag only worked when it happened to be last on the line. That silently
 * turned a control run — the whole point of which is to differ from the real
 * one — into a second copy of the real run, and it took the two agreeing when
 * they should not have to notice.
 */
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  const hasValue = next !== undefined && !next.startsWith("--");
  args.set(token.slice(2), hasValue ? next : true);
  if (hasValue) i += 1;
}
const port = Number(args.get("port"));
const endpoint = args.get("endpoint") ?? "sign-up";
const n = Number(args.get("n") ?? 50);
const taken = args.get("taken") ?? "verify@hanzimind.test";
const password = args.get("password") ?? "oracle-probe-password";
const pad = Number(args.get("pad") ?? 0);
const quantum = Number(args.get("quantum") ?? 750);
const control = args.has("control");
const content = args.has("content");
const concurrent = Number(args.get("concurrent") ?? 1);
const sameIp = args.has("same-ip");
const json = args.has("json");
if (!port || !n) {
  console.error(
    "usage: oracle-probe.mjs --port <p> [--endpoint sign-up|password-reset|send-verification|sign-in]\n" +
      "                       [--n 50] [--taken <email>] [--pad <chars>] [--quantum 750]\n" +
      "                       [--concurrent <k>] [--content] [--same-ip] [--control] [--json]",
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
const callOnce = async (email, leverValue) => {
  forwarded += 1;
  const started = performance.now();
  const response = await fetch(`${base}${spec.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      // A fresh bucket per request, so the rate limit never colours the timing.
      // `--same-ip` pins it instead, which is how an attacker with no control
      // over that header operates and puts the limiter's own budget in play.
      "x-forwarded-for": sameIp
        ? "10.255.255.255"
        : `10.${(forwarded >> 16) & 255}.${(forwarded >> 8) & 255}.${forwarded & 255}`,
    },
    body: JSON.stringify(spec.body(email, leverValue)),
  });
  const text = await response.text();
  return {
    ms: performance.now() - started,
    status: response.status,
    body: canonical(text, email),
    headers: headerFingerprint(response),
  };
};

/**
 * One observation, which with `--concurrent k` is a whole burst folded into a
 * single signature.
 *
 * Awaiting each request in turn — which is all this probe used to do — means
 * two requests for the same address never overlap, and overlapping is the whole
 * question. better-auth's sign-up looks the address up and then inserts, and
 * the two are not atomic: a burst at a FREE address had both pass the lookup,
 * both attempt the insert, and the unique index reject one, which came back as
 * a 422. A burst at a TAKEN address never inserts and so cannot 422. That is a
 * status-code channel, invisible to a probe that measures one request at a
 * time, and it needed no statistics — one burst told an attacker the answer.
 *
 * Folding the burst into `status` as a sorted multiset ("200,422") and into
 * `body` as its distinct shapes lets the rest of this script compare bursts
 * exactly as it compares single requests.
 */
const call = async (email, leverValue) => {
  if (concurrent <= 1) return callOnce(email, leverValue);
  const results = await Promise.all(
    Array.from({ length: concurrent }, () => callOnce(email, leverValue)),
  );
  return {
    // The burst is as slow as its slowest member, which is what a caller waits.
    ms: Math.max(...results.map((r) => r.ms)),
    status: results
      .map((r) => r.status)
      .sort()
      .join(","),
    body: [...new Set(results.map((r) => r.body))].sort().join(" ++ "),
    headers: [...new Set(results.map((r) => r.headers))].sort().join(" ++ "),
  };
};

/**
 * What the second arm asks about.
 *
 * `--control` points it at a fresh address too, so the run compares free
 * against free and every millisecond it reports is this machine's own noise at
 * this body size. That number is the bar a real finding has to clear, and
 * without it a padded run cannot tell a leak from a GC pause: an 8 ms gap on a
 * 4 MB body looked like a finding until the control put the floor at the same
 * 8 ms. Run the control whenever a comparison reports a gap.
 */
const secondArm = () => (control ? freeAddress() : taken);

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

/**
 * One whole comparison at one lever value: `runs` interleaved pairs, folded
 * into a summary per kind and the four verdicts that matter.
 *
 * Taking the lever as an argument rather than reading a module constant is what
 * lets a sweep drive this — over content classes, or over burst widths —
 * instead of the script asking one question per invocation.
 */
const measure = async (leverValue, runs) => {
  const kinds = {
    free: { ms: [], statuses: new Map(), bodies: new Set(), headers: new Set() },
    taken: {
      ms: [],
      statuses: new Map(),
      bodies: new Set(),
      headers: new Set(),
    },
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

  for (let i = 0; i < runs; i++) {
    // Alternate which kind leads, so a per-pair ordering cost lands on both.
    if (i % 2 === 0) {
      record("free", await call(freeAddress(), leverValue));
      record("taken", await call(secondArm(), leverValue));
    } else {
      record("taken", await call(secondArm(), leverValue));
      record("free", await call(freeAddress(), leverValue));
    }
  }

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
  const taken = summary("taken");

  // "Within 10 percent of each other" needs a denominator that does not flatter
  // the bigger number, so the smaller median is the one to divide by.
  const gap = Math.abs(free.p50 - taken.p50);
  const gapPercent = (gap / Math.max(1, Math.min(free.p50, taken.p50))) * 100;

  return {
    free,
    taken,
    gap,
    gapPercent,
    sameBody:
      free.bodies.length === 1 &&
      taken.bodies.length === 1 &&
      free.bodies[0] === taken.bodies[0],
    sameHeaders:
      free.headers.length === 1 &&
      taken.headers.length === 1 &&
      free.headers[0] === taken.headers[0],
    sameStatus:
      JSON.stringify(free.statuses) === JSON.stringify(taken.statuses),
    sameBuckets: JSON.stringify(free.buckets) === JSON.stringify(taken.buckets),
  };
};

/**
 * Content classes for `--content`.
 *
 * Every one of these is well inside `AUTH_FIELD_LIMITS.name`, and that is the
 * point: the bounds this codebase added check how LONG a field is and never
 * what it CONTAINS, so a lever that is short and strange walks straight past
 * them. Two channels were found exactly here.
 *
 * - A NUL byte makes the insert fail on demand. `users.name` is `text NOT NULL`
 *   and Postgres rejects a NUL with SQLSTATE 22021, so the free path 422s where
 *   the taken path — which never inserts — answers 200. It also falsifies the
 *   claim in `auth-race.ts` that the replay-failed branch is not
 *   attacker-triggerable.
 * - A lone surrogate is stored as U+FFFD, so the free path echoes the row the
 *   database returned and the taken path echoes what the caller sent, and the
 *   two 200s differ byte for byte.
 *
 * The general shape both share is that one path round-trips the value through
 * Postgres and the other does not, so anything Postgres treats specially is a
 * lever. That is why the list is organised by what the storage or the
 * serialiser might do to a string rather than by what looks dangerous.
 */
const CONTENT_CLASSES = [
  { name: "plain", value: "Oracle Probe" },
  { name: "empty", value: "" },
  { name: "whitespace", value: "   " },
  // Rejected by Postgres outright: the insert fails, nothing else does.
  { name: "nul", value: "Oracle\u0000Probe" },
  // Not representable in UTF-8, so a round trip replaces it.
  { name: "lone-surrogate", value: "Oracle\ud800Probe" },
  { name: "unpaired-low", value: "Oracle\udfffProbe" },
  // Four-byte UTF-8: fine, but a different byte length from its UTF-16 length.
  { name: "astral", value: "Oracle\u{1f600}Probe" },
  // Normalisation: a round trip could compose or decompose either of these.
  { name: "nfd", value: "Oracle\u0301Probe" },
  { name: "nfc", value: "Oracl\u00e9 Probe" },
  // Invisible, and easy for a sanitiser on one path only to strip.
  { name: "zero-width", value: "Oracle\u200bProbe" },
  { name: "bidi-override", value: "Oracle\u202eProbe" },
  // Newlines matter twice over: a round trip may normalise CRLF, and one path
  // renders this into an email.
  { name: "newline", value: "Oracle\nProbe" },
  { name: "crlf", value: "Oracle\r\nProbe" },
  // Things a serialiser escapes.
  { name: "json-escapes", value: 'Oracle"\\Probe' },
  { name: "backslash-u", value: "Oracle\\u0000Probe" },
  // Things a template or a query might treat as syntax.
  { name: "html", value: "<script>Oracle</script>" },
  { name: "quote-dash", value: "Oracle'--Probe" },
  { name: "percent", value: "Oracle%00Probe" },
];

const verdictOf = (r) => {
  const differs = [];
  if (!r.sameStatus) differs.push("status");
  if (!r.sameBody) differs.push("body");
  if (!r.sameHeaders) differs.push("headers");
  if (!r.sameBuckets) differs.push("bucket");
  return differs;
};

const statusesOf = (s) =>
  Object.entries(s.statuses)
    .map(([code, count]) => `${code}x${count}`)
    .join(" ");

const reportDefault = (r) => {
  const line = (s) =>
    `${s.kind.padEnd(5)} n ${s.n}  ${statusesOf(s)}  p50 ${s.p50} ms  p95 ${s.p95} ms  max ${s.max} ms  bucket ${s.buckets.map((b) => `x${b}`).join(",")}`;
  console.log(
    `endpoint ${endpoint}  ${spec.path}` +
      (pad ? `  ${spec.lever} padded to ${pad} chars` : "") +
      (concurrent > 1 ? `  bursts of ${concurrent}` : "") +
      (sameIp ? "  one IP, rate limiter live" : "") +
      (control ? "  CONTROL: both arms are free addresses" : ""),
  );
  console.log(line(r.free));
  console.log(line(r.taken));
  console.log(
    `median gap ${r.gap} ms (${r.gapPercent.toFixed(1)}% of the smaller median)`,
  );
  console.log(`status   ${r.sameStatus ? "identical" : "DIFFERENT"}`);
  console.log(`headers  ${r.sameHeaders ? "identical" : "DIFFERENT"}`);
  console.log(`body     ${r.sameBody ? "identical" : "DIFFERENT"}`);
  console.log(
    `buckets  ${r.sameBuckets ? "identical" : "DIFFERENT"} (quantum ${quantum} ms)`,
  );
  // The 10% rule is meaningful against a 750 ms bucket and close to meaningless
  // against a 20 ms rejection, where 10% is two milliseconds of jitter. When
  // the only thing separating the two kinds is the median, say so rather than
  // let the exit code imply more than it knows.
  if (
    r.sameBody &&
    r.sameHeaders &&
    r.sameStatus &&
    r.sameBuckets &&
    r.gapPercent > 10
  ) {
    console.log(
      !control
        ? "note     only the median separates them. Re-run with --control to see this machine's floor at this body size before believing it."
        : "note     this IS the control, so that gap is the floor, not a finding.",
    );
  }
  if (!r.sameBody || !r.sameHeaders) {
    console.log(`  free  body    ${r.free.bodies.join("\n              ")}`);
    console.log(`  taken body    ${r.taken.bodies.join("\n              ")}`);
    console.log(`  free  headers ${r.free.headers.join("\n              ")}`);
    console.log(`  taken headers ${r.taken.headers.join("\n              ")}`);
  }
};

const runContentSweep = async () => {
  console.log(
    `content sweep  ${endpoint}  ${spec.path}  lever ${spec.lever}  ${n} pairs per class` +
      (control ? "  CONTROL: both arms are free addresses" : ""),
  );
  console.log(
    `${"class".padEnd(16)} ${"free".padEnd(14)} ${"taken".padEnd(14)} verdict`,
  );
  const leaked = [];
  for (const klass of CONTENT_CLASSES) {
    const r = await measure(klass.value, n);
    const differs = verdictOf(r);
    if (differs.length) leaked.push({ klass, r, differs });
    console.log(
      `${klass.name.padEnd(16)} ${statusesOf(r.free).padEnd(14)} ${statusesOf(
        r.taken,
      ).padEnd(14)} ${differs.length ? `*** LEAK: ${differs.join(", ")}` : "identical"}`,
    );
  }
  console.log("");
  if (!leaked.length) {
    console.log(`no content class separated the two kinds`);
    return 0;
  }
  console.log(`${leaked.length} of ${CONTENT_CLASSES.length} classes leak:`);
  for (const { klass, r, differs } of leaked) {
    console.log(`  ${klass.name} — ${differs.join(", ")}`);
    console.log(`    lever   ${JSON.stringify(klass.value)}`);
    if (!r.sameBody) {
      console.log(`    free    ${r.free.bodies.join(" | ").slice(0, 300)}`);
      console.log(`    taken   ${r.taken.bodies.join(" | ").slice(0, 300)}`);
    }
  }
  return 1;
};

// One warm pair before anything is recorded: a dev server compiles the route on
// its first request, and whichever kind went first would otherwise carry the
// whole compile.
await call(freeAddress(), lever);
await call(secondArm(), lever);

const failed = content
  ? await runContentSweep()
  : await (async () => {
      const r = await measure(lever, n);
      if (json) {
        console.log(
          JSON.stringify({ endpoint, pad, quantum, ...r }, null, 2),
        );
      } else {
        reportDefault(r);
      }
      // Exit 1 on anything that distinguishes the two, so a lane can assert on
      // it. Buckets are checked separately from the median gap because they
      // catch a different failure: two runs 194% apart show up in both, but a
      // run that straddles a boundary can hold its medians close while a single
      // request still sorts the two kinds.
      return r.sameBody &&
        r.sameHeaders &&
        r.sameStatus &&
        r.sameBuckets &&
        r.gapPercent <= 10
        ? 0
        : 1;
    })();

process.exit(failed);
