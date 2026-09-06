# Deck create

A signed-in learner fills in a name, a description, and one vocabulary item per line at `/decks/new`, submits `Create Deck`, and lands on the new deck's page. Every deck is public. There is no visibility toggle, so the deck appears on `/decks` for every signed-in user the moment it exists. Items already in the dictionary are linked as they are, and every part they are built from is added to the deck alongside them.

## Sub-features

- `deck-create-gate` sends a signed-out visitor to `/signin?redirectUrl=decks/new`.
- `deck-create-form` renders the three fields and the submit button.
- `deck-create-validation` blocks a blank name or description and accepts an empty vocabulary list.
- `deck-create-dictionary` creates a deck from single characters the dictionary already holds, with no external service.
- `deck-create-constituents` includes the parts of each character in the resulting deck.
- `deck-create-unknown` fails with a named item when a line is not in the dictionary and cannot be built.
- `deck-create-result` redirects to `/decks/<id>` and shows the new deck.
- `deck-create-api` creates the same deck through `POST /api/rpc/decks/create`.

## How to get to it (user POV)

- Sign in, open `Decks` in the header, and choose the `Create Deck` link in the page header.
- Sign in and open `http://localhost:PORT/decks/new` directly.
- On an empty `/decks` page, choose the `Create Deck` link inside the `No decks yet` empty state.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up on `PORT` and `scripts/doctor.sh <n>` printed four `ok` lines.
- The learner `verify@hanzimind.test` / `verify-hanzimind` exists and owns only the seeded `HSK 1` deck.
- No deck named `Verify deck` exists yet. Read it back first with `psql "$DATABASE_URL" -c "select id from decks where deck_name = 'Verify deck';"` and expect zero rows.
- The lane's `DEEPL_API_KEY` may be a placeholder. The dictionary recipe below does not call DeepL.

- **Signed-out gate.** Open the form without a session. Run `navigate` with `http://localhost:PORT/decks/new`. The page moves to `/signin?redirectUrl=decks/new`. If the session check is still pending the page briefly shows a spinner, and if the redirect has not fired yet it shows the heading `Authentication Required`, the text `You must be logged in to create a deck.`, and a `Sign In` link.
- **Signed-in form.** Sign in as the learner (see `sign-in.md`), then run `navigate` with `http://localhost:PORT/decks/new`. Run `get_page_text`. The heading is `Create New Deck` and the subtitle is `Create a new vocabulary deck to start learning Chinese characters.` Run `read_page` with filter `interactive`. It lists a textbox labeled `Deck Name` with placeholder `Enter deck name`, a textarea labeled `Description` with placeholder `Enter deck description`, a textarea labeled `Vocabulary Items` whose placeholder starts `Enter vocabulary items (one per line)`, and a button `Create Deck`. Under the vocabulary field the helper text reads `Enter one vocabulary item per line. Each item will be automatically broken down into components.`
- **Blank validation.** Leave every field empty and choose `Create Deck`. Run `find` with `Create Deck button`, then `computer` `left_click` on that ref. Nothing is submitted. `Deck Name` and `Description` carry the browser's `required` attribute, so the browser's own validation bubble stops the submit before the form runs. No toast appears and the URL stays `/decks/new`.
- **Whitespace validation.** Type a single space into `Deck Name` and `Description`, then choose `Create Deck`. Run `form_input` with the `Deck Name` ref and value ` `, `form_input` with the `Description` ref and value ` `, then `computer` `left_click` on `Create Deck`. A toast reads `Deck name and description are required` and no request is sent.
- **Fill the deck.** Run `form_input` with the `Deck Name` ref and value `Verify deck`. Run `form_input` with the `Description` ref and value `Verification deck of dictionary characters`. Click into `Vocabulary Items` and type the six characters one per line. Run `computer` `left_click` on the `Vocabulary Items` ref, then `computer` `type` with `人`, `computer` `key` with `Return`, and repeat for `大`, `一`, `我`, `你`, `好`. Run `get_page_text` and confirm the textarea shows six lines.
- **Before screenshot.** Run `computer` `screenshot` with `save_to_disk` set. The image shows the filled form with `Create Deck` still enabled.
- **Submit.** Run `find` with `Create Deck button`, then `computer` `left_click` on that ref. The button text reads `Creating...` while the request runs. A toast reads `Deck created!` and the URL becomes `/decks/<id>` where `<id>` is a UUID.
- **Resulting deck.** Run `get_page_text` on the deck page. The `h1` is `Verify deck`, the description matches what was typed, the stat row reads `@Verify Learner`, `N items`, and `0 learners`, and the heading `What's inside` sits above a card titled `Components` and, below it, a card titled `Characters`. The `Characters` card holds chips for `人`, `大`, `一`, `我`, `你`, `好` and also `尔`, `女`, `子`, which arrived as parts. The `Components` card holds at least `亻`, `扌`, `戈`. `N items` is larger than 6 because parts are always included.
- **After screenshot.** Run `computer` `screenshot` with `save_to_disk` set. The image shows the deck page with the `Save Deck` button and the grouped chips.
- **Unknown single character.** Return to `/decks/new`, fill a name and description, and enter one line that is not in the dictionary, for example a Latin letter such as `Q`. Choose `Create Deck`. A toast reads `Failed to create vocab item: Q`. No deck is created. A single character has no source other than the dictionary seed, so this fails before any external call.
- **Unknown compound.** Enter one line with two or more characters that the seed does not hold, for example `你好`. Choose `Create Deck`. The server translates the word with DeepL and generates audio before it can insert it. With a placeholder `DEEPL_API_KEY` the DeepL request is rejected, the toast reads `Failed to create vocab item: 你好`, and no deck is created. Report this path as blocked by the missing key, not as a failure of the form.
- **Curl create.** Sign in and reuse the cookie jar, then post the same input. Run
  `curl -s -c jar.txt -H 'content-type: application/json' -d '{"email":"verify@hanzimind.test","password":"verify-hanzimind"}' http://localhost:PORT/api/auth/sign-in/email`
  then
  `curl -s -b jar.txt -w '\n%{http_code}\n' -H 'content-type: application/json' -d '{"json":{"deckName":"Verify deck","description":"Verification deck of dictionary characters","vocabList":["人","大","一","我","你","好"]}}' http://localhost:PORT/api/rpc/decks/create`.
  The body is `{"json":{"id":"<uuid>"}}` and the status is `200`. Without the cookie the status is `401` and the body carries `"code":"UNAUTHORIZED"`. The input shape is exactly `deckName` (string), `description` (string), `vocabList` (array of strings).
- **Database proof.** Read the row back. Run `psql "$DATABASE_URL" -c "select id, deck_name, description, created_by_id from decks where deck_name = 'Verify deck';"`. One row exists and `created_by_id` is the learner's `users.id`. Then run `psql "$DATABASE_URL" -c "select count(*) filter (where not is_constituent) as typed, count(*) filter (where is_constituent) as parts from deck_vocab_items where deck_id = '<id>';"`. `typed` is `6` and `parts` is greater than `0`.
- **Proof.** Keep the before and after screenshots, the `get_page_text` output that shows `Deck created!` or the deck heading, and the two `psql` results. Record `deck-create.md` and the sub-feature ID with each artifact.

## Gotchas

- Items are split on newlines only. Six characters on one line separated by spaces are one item, the server treats it as a sentence, and it fails with `Failed to create vocab item: 人 大 一 我 你 好` after a DeepL call. Put each character on its own line.
- `form_input` on the `Vocabulary Items` textarea sets the whole value at once. If the harness cannot pass literal newlines, click the textarea and use `computer` `type` plus `key` `Return` between items as the recipe does.
- The API accepts an empty `deckName` and `description`. Only the form checks for blanks, so a `curl` test of validation proves nothing about the server.
- Creating the same name twice creates two decks. Nothing is unique on `deck_name`, so the `psql` precondition matters if a recipe reruns.
- Dictionary characters need no external service, but a compound or sentence that the seed does not hold calls DeepL and then the TTS provider and S3. A placeholder `DEEPL_API_KEY` fails the first of those, so treat `deck-create-unknown` for compounds as an environment gate.
- A disabled glyph that exists in the dictionary is silently dropped from the request rather than reported. The deck is created without it and without an error.
- The redirect to `/signin` is client side and waits for the session check. Read the URL after the page settles, not on the first paint.
- `Create Deck` appears twice on `/decks`, once in the page header and once in the empty state. Both link to `/decks/new`. On `/decks/new` the submit button has the same text, so scope `find` to the form.
- The browse page caches its deck list. After creating a deck, reload `/decks` before asserting that the new card is present.
