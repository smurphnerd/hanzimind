# Hygiene program: handoff

The program ran from the plan in `hygiene-plan.md` and finished phases 0 to 4 on
6 September 2026. Everything in those phases is merged to `main`, deployed, and
the schema is migrated. This document is for whoever picks the work up next,
including the author in three months.

## Where things are

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| Production   | `https://hanzimind.smurphnerd.com` (the value of `BASE_URL` in Doppler's prod config) |
| `main`       | deployed; phase 0 to 4 complete                                                       |
| `hygiene`    | the integration branch, identical to `main`                                           |
| The plan     | `docs/hygiene-plan.md`, 36 sections, 26 done                                          |
| The findings | `docs/hygiene-findings.md`, 83 rows                                                   |
| Evidence     | `/Users/smurphnerd/projects/hanzimind-evidence/`, not in the repo                     |

`hanzimind.com` is **not** this app. It answers 200 on its homepage and 404 on
every application route, so health-checking it looks like it passes while
testing nothing. Check a subroute, never just `/`.

## What shipped

Two defects that were live in production and affecting real data:

- **A deck create failing partway left the words the learner typed permanently
  in the shared dictionary**, with no deck to reach them from and no way to
  remove them. The trigger was ordinary: every Latin letter and digit is absent
  from the seeded dictionary, so `T恤`, `PPT` and `K歌` all fired it. Fixed by
  splitting the create at the network-and-write seam, so the slow calls happen
  outside the transaction and every row lands inside it.
- **Two concurrent study answers lost one of them.** The write lock is now taken
  on the row that always exists rather than the progress row, which may not.

And the rest: seven indexes that take the deck browse query from a sequential
scan over twelve thousand rows to an index scan, 265 ms to 17. Delete cascades
so a learner's own rows go with their account, closing a window where the auth
library removes the user row in a later transaction and anything written in
between locked the learner out with their credentials already gone. Thirteen
dependency majors. Progress reshaped from four column pairs into one row per
study type. The sign-up account-existence oracle, closed after eight
verification rounds and six distinct channels.

## What is deliberately not done

**P4-MIGRATE is withdrawn.** The operator chose `db:push` over migration files.
That decision has a consequence worth understanding before changing the schema
again, in the next section.

**Phase 5, eight sections, is deferred.** It is the UI and UX audit against the
ui-skills MCP. Nothing depends on it and nothing in it is urgent.

**Phase 6 is two sections.** `P6-DOCS` is small. `P6-LEGAL` is blocked on the
operator for a company name, jurisdiction and contact address, which cannot be
invented.

## The thing most likely to bite you

`pnpm db:push` **cannot be read for success in either form.**

Without `--force`, a schema containing any data-loss statement makes it print a
prompt. With no TTY it takes the prompt as declined, **exits 0, and applies
nothing at all** — including every safe statement travelling with the risky one.
A push carrying two column drops and seven `CREATE INDEX` statements applies
zero of the nine and reports success.

With `--force` it skips the prompt but still exits 0 when a statement fails.

So neither exit code means the schema changed. The only honest check is reading
the schema back from `information_schema`. This is finding 78, and it was
established the hard way: a lane harness ran for 526 seconds against a broken
schema, printed ready, and cached the result.

The deploy sequence that works:

```
git merge --no-ff hygiene            # onto main
# wait for the Vercel Production deployment to report success
doppler run --config prod --project hanzimind -- npx drizzle-kit push --force
# then read the schema back and confirm a second push says No changes detected
```

Deploy first, then push, when the new code can run against the old schema.
Reverse it only when the new code needs a table the old schema lacks — then the
window is the length of the build rather than the length of the push.

Vercel **Preview** deploys fail on missing environment variables; Production
succeeds. The variables are scoped to Production only. Tick Preview if preview
builds matter.

## Open findings

36 open: 6 major, 24 minor, 6 cosmetic. 47 closed. The counts in
`hygiene-findings.md` are derived from the table by a script that refuses to run
against a malformed row, because the paragraph went stale three times while the
table grew.

The six majors, in the order worth caring about:

**51 — a 50-word deck create takes 28.6 seconds on a held HTTP request.**
`prepareVocabItems` awaits DeepL, TTS and S3 serially, one glyph at a time. This
is the largest user-visible problem left in the codebase and it is unassigned.

**64 — the rate limit is bypassable with one header.** The auth library resolves
the client IP from `X-Forwarded-For` with no trusted-proxy list configured, so an
enumerator gets a fresh budget per forged value. Fixing it needs one fact from
the operator: what fronts production. Until that is known the fix cannot be
written, because a wrong trusted-proxy list is worse than none.

**78 — `db:push` reports success over an unchanged schema.** Described above.
Unassigned because the operator chose to stay on `db:push`; the fix is a wrapper
that reads the schema back rather than a change of tool.

**81 — the timing defence on password reset only holds on loopback.** The found
arm sends mail and the not-found arm does not, so with a realistic relay a taken
address answers 1506 ms against 756. Disjoint, 35 of 35, one request, no
statistics. Every measurement this program took of those two routes used local
mail, so every one of them measured the wrong environment. The remedy invented
for sign-up — defer the mail — applies here unchanged.

**76 — the cross-request channel is unmeasured, not absent.** Deferred sign-up
work is asymmetric, so a subsequent request's latency could carry what the same
request no longer does. Every probe this program built measures the same
request. The finding names the mechanism and specifies the mode that would test
it.

**52 — `/decks/[deckId]` is 22,686 bytes over its budget**, three times the
budget applied to the dictionary page.

## How the work was checked, and why it matters

Every section was built by one owner and then attacked by an independent
verifier that could not see the owner's reasoning. That structure caught things
no test did, and the same failure shape recurred often enough to be worth naming.

**A check that passes for a reason unrelated to what it names.** A regression
test that passed against the bug it was written for. A fix demonstration whose
before and after were both green. A comparison keyed more coarsely than the
thing it measured. A rate-limit test that asserted the rule _existed_ and passed
throughout the period the limiter was not running. A `grep -c` that returned
zero because the path was malformed, reported as evidence of absence.

The generalisation, now standing order 16: **a negative result from a command
that can also fail is not a negative result until the command is shown to have
run.**

**A confident comment asserting something cannot happen.** Twice on one branch,
written in the same commit as the change that made it false, checked against
nothing: `auth-race.ts`'s "not attacker-triggerable" hid a NUL-byte channel, and
a route's "everything that already governs it still applies" hid the fact that
bypassing the auth router silently removed the rate limiter, the origin check
and CSRF. A comment claiming a property is a claim like any other. Assert the
property; do not describe it.

**Statistical estimators that flatter the person running them.** Three, on the
enumeration work alone: a control that could not disagree, a statistic that
found fewer leaks the longer it looked, and one that manufactured leaks from a
degenerate control. Each was caught by evidence contradicting itself, never by
re-reading the code. The probe at
`.claude/skills/verify-hanzimind/scripts/oracle-probe.mjs` now refuses to print
an accuracy with no control floor.

## The verification skill

`.claude/skills/verify-hanzimind/` drives the app the way a user does. It boots
an isolated Docker compose project per lane — Postgres, S3 mock, Mailpit, a dev
or production server — so several agents can work at once without touching the
developer's own containers. Every docker command must be scoped
`-p hanzimind-lane-<n>`; a bare `docker compose` reaches the developer's stack.

`doctor.sh <n>` refuses a non-localhost database host, which is what keeps a lane
from ever pointing at production.

Two of its feature files told a verifier to query columns that a later PR
dropped. Both are fixed, but the class of problem is worth remembering: the
skill is instructions that execute, so a schema change can break it silently.
