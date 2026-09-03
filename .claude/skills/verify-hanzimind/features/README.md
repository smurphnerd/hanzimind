# HanziMind verification map

This directory is the maintained source for verifying the user-facing behavior of HanziMind. Read this index before driving the app, then use the matching feature file as the recipe. `../SKILL.md` owns launch, doctor, evidence, and cleanup. This file owns the conventions every feature file assumes.

## Baseline preconditions

- A lane is up. `scripts/lane-up.sh <n>` printed `ready on <port>` and `scripts/doctor.sh <n>` printed four `ok` lines.
- `PORT` below means the lane's dev port, `LANE_PORT_BASE + n`, 3000 + n by default.
- The lane database was seeded with `SEED_TEST_USER=1`, so these accounts exist, verified, with no saved decks and no progress:
  - Learner `verify@hanzimind.test`, password `verify-hanzimind`, role `user`.
  - Admin `verify-admin@hanzimind.test`, password `verify-hanzimind`, role `admin`.
- `lane-up.sh` also seeds one public deck, `HSK 1` (id `deck-hsk1`, 150 words plus the characters and components they are built from), owned by the learner account. Nobody has saved it yet. A recipe that needs a second deck starts from `deck-create.md`.
- Never drive a dev server this run did not start. Two lanes share nothing: each has its own Postgres, s3mock, Mailpit, and dev server.

## Driving conventions

- The browser harness is the `claude-in-chrome` skill. Open one tab per lane with `tabs_create_mcp`, navigate with `navigate`, locate elements with `find` or `read_page` (filter `interactive`), act with `computer` (`left_click` with a `ref`, `type`, `key`) and `form_input`, and read state with `get_page_text`.
- Handles in the recipes are the accessible name, label, placeholder, or visible text that the component renders. Prefer them over coordinates. Where a component ships a `data-testid` or `aria-label`, the recipe names it.
- The API harness is `curl` against `http://localhost:PORT/api/rpc/<router>/<procedure>`. The request is `POST`, `content-type: application/json`, body `{"json": <input>}`. Sign in first with `POST /api/auth/sign-in/email` and reuse the cookie jar: `jar.txt` for the learner, `admin-jar.txt` for the admin. `../SKILL.md` shows both commands.
- Drive at exactly `http://localhost:PORT`. A `<name>.localhost` alias or `127.0.0.1` makes every RPC fail with `Failed to fetch`, because the client posts to the absolute `BASE_URL` origin and the CSP blocks the cross-origin call.
- A `left_click` by `ref` is often dropped, after `form_input` and on plain links alike. After any click, verify by URL or page text; if nothing changed, re-run `find` and click the fresh ref, or click by coordinate. `/decks` swallows every click while it paints skeletons, which lasts 10 to 25 seconds per load, so wait for the deck cards before clicking anything there. `get_page_text` returns `<main>` only, so a toast needs a screenshot or `find "toast"`.
- Treat every command and every string as literal. Keep quoted names unchanged.
- A mutation leaves state behind in the lane database. Note it in the proof, and read it back as the second view. `psql "$DATABASE_URL" -c "<sql>"` in a recipe means a host `psql` with the lane's `.env.lane` sourced, or, since the host has no `psql`, the `docker compose ... exec -T postgres psql -U postgres -c "<sql>"` form in `../SKILL.md`. Column names are snake_case.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen. One screenshot before the action and one after is the minimum for a mutation.
- A browser proof is a screenshot saved with `save_to_disk` and copied into the evidence directory `../SKILL.md` names, plus the `get_page_text` or `read_page` output that shows the asserted text.
- An API proof is the `curl` command, the response body, and the HTTP status.
- A mutation proof adds a read-only second view of the stored row.
- Record the feature file and the sub-feature ID with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition. Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with claude-in-chrome` starts with `Preconditions:` and uses labeled bullets that pair each user action with the harness call and the observable result. API-only behavior gets a `curl` bullet in the same section.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign in](./sign-in.md) covers the sign-in form, validation, the sign-up form, and the verified landing page.
- [Study session](./study-session.md) covers picking a deck, answering a card in each study type, the result card, and session progress.
- [Dictionary](./dictionary.md) covers search, the entry page, decomposition, audio, and the graph view.
- [Deck browse and save](./deck-browse-and-save.md) covers browsing public decks, saving one, and deck detail.
- [Deck create](./deck-create.md) covers the deck creation form, adding vocabulary, and the resulting deck.
- [Memory aids](./memory-aids.md) covers creating, viewing, and managing memory aids on an entry.
- [Admin vocab](./admin-vocab.md) covers the admin vocabulary table and inline edits.
- [Admin suggestions](./admin-suggestions.md) covers reporting an issue and triaging suggestions as admin.
- [Profile and sign out](./profile-and-signout.md) covers the profile page, the header menu, and signing out.

## Route index

Every `page.tsx` under `src/app` and the feature file that covers it. Regenerate the left column with `find src/app -name page.tsx | sort`.

| Route | Feature file |
| --- | --- |
| `/` | profile-and-signout.md (signed-in dashboard) and sign-in.md (signed-out landing) |
| `/admin/suggestions` | admin-suggestions.md |
| `/admin/vocab` | admin-vocab.md |
| `/decks` | deck-browse-and-save.md |
| `/decks/[deckId]` | deck-browse-and-save.md |
| `/decks/new` | deck-create.md |
| `/dictionary` | dictionary.md |
| `/dictionary/[word]` | dictionary.md and memory-aids.md |
| `/privacy` | profile-and-signout.md (static footer page) |
| `/profile` | profile-and-signout.md |
| `/resources` | profile-and-signout.md (static footer page) |
| `/signin` | sign-in.md |
| `/signup` | sign-in.md |
| `/study` | study-session.md |
| `/study/[deckId]` | study-session.md |
| `/verified` | sign-in.md |
