# Deck browse and save

A signed-in learner browses every deck at `/decks`, searches by name or description, pages through results twelve at a time, and saves a deck to their study list from either the deck card or the deck's own page. Saving opens a dialog with four study-mode switches and writes one `user_decks` row. The deck page at `/decks/[deckId]` lists the deck's contents grouped by type, switches to a graph banded by unlock depth, and offers the same save dialog. The saved list lives at `/study`.

## Sub-features

- `deck-browse-list` shows every deck as a card with name, description, author, learners, item count, and a composition bar.
- `deck-browse-search` filters by name or description on Enter and titles the results.
- `deck-browse-empty` shows an empty state with no decks and a different one for a search miss.
- `deck-browse-paging` shows the range, `Previous`, and `Next`, twelve decks per page.
- `deck-save-card` saves from a card with `Save to Study List` and the settings dialog.
- `deck-save-detail` saves from the deck page with `Save Deck` and the same dialog.
- `deck-save-settings` blocks saving with every mode off and re-opens as an edit once saved.
- `deck-saved-list` shows the saved deck at `/study` with `Start studying`.
- `deck-detail-list` groups the deck's items by type with chips, audio, and `Show all`.
- `deck-detail-graph` switches to the graph, with a depth control when the deck has more than one level.
- `deck-save-api` saves through `POST /api/rpc/study/addDeck`.

## How to get to it (user POV)

- Sign in and open `Decks` in the header. That is `/decks`.
- Sign in and open `http://localhost:PORT/decks` directly.
- On `/study` with no decks, choose `Browse decks` in the empty state.
- Choose a deck card's name on `/decks` to open `/decks/<id>`.
- After creating a deck the app lands on `/decks/<id>` on its own.
- Open `Study` in the header to see saved decks at `/study`.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up on `PORT` and `scripts/doctor.sh <n>` printed four `ok` lines.
- The learner `verify@hanzimind.test` / `verify-hanzimind` is signed in in the harness tab and has no saved decks.
- `lane-up.sh` seeds `HSK 1` with id `deck-hsk1`, owned by the learner, so `<id>` below is `deck-hsk1`. To exercise a second deck, create one by following `deck-create.md`.
- `psql "$DATABASE_URL" -c "select count(*) from user_decks;"` returns `0` before the save steps.

- **Signed-out browse.** Without a session, run `navigate` with `http://localhost:PORT/decks`. The page renders the heading `Vocabulary Decks` and an empty state titled `Couldn't load decks` with the text `Please sign in to browse decks.` Browse is an authenticated endpoint.
- **Browse list.** Sign in, then run `navigate` with `http://localhost:PORT/decks`. Run `get_page_text`. The `h1` is `Vocabulary Decks`, the subtitle is `Browse what the community has planted, then add a deck to your garden.`, the page header has a `Create Deck` link, and the section heading is `Most Popular`. One card is titled `HSK 1` with its description, `@Verify Learner`, `0 learners`, and `N items`. Run `read_page` with filter `interactive`. The card exposes a button `Save to Study List` and an image whose accessible name lists the composition, in the form `3 components, 9 characters`. The link to the deck page is the card's overlay link, which has no accessible name of its own, so locate it with `find "HSK 1 deck card"` or by clicking the card's title text, then confirm the URL becomes `/decks/deck-hsk1`.
- **Search hit.** Type into the search box and press Enter. Run `find` with `Search decks... textbox`, `form_input` with that ref and value `HSK`, then `computer` `key` with `Return`. The heading changes to `Results for “HSK”` and the `HSK 1` card remains. Search is a substring match against name and description, case insensitive.
- **Search miss.** Replace the query with `volcano` and press Enter. Run `form_input` with the search ref and value `volcano`, then `computer` `key` with `Return`. The heading reads `Results for “volcano”` and an empty state titled `No decks match “volcano”` shows the text `Try a different word, or plant a deck of your own.` and a `Create Deck` link. Clear the box and press Enter to return to `Most Popular`.
- **Paging.** With one deck, run `get_page_text`. The footer reads `1–1 of 1` and both `Previous` and `Next` are disabled. The page size is 12. `Next` enables only after a thirteenth deck exists, which no recipe here creates.
- **Empty browse.** Only reachable after removing the seeded deck with `psql "$DATABASE_URL" -c "delete from deck_vocab_items where deck_id = 'deck-hsk1'; delete from decks where id = 'deck-hsk1';"`, so run it last or skip it. Run `navigate` with `http://localhost:PORT/decks`. The empty state is titled `No decks yet` with the text `Nothing has been planted here yet — be the first.` and a `Create Deck` link that links to `/decks/new`.
- **Before screenshot.** On `/decks` with the unsaved `HSK 1` card visible, run `computer` `screenshot` with `save_to_disk` set. The card shows `Save to Study List` and no `Saved` pill.
- **Open the save dialog from the card.** Run `find` with `Save to Study List button`, then `computer` `left_click` on that ref. A dialog opens titled `Add Deck to Study List` with the description `Choose how you want to study “HSK 1”.` Run `read_page` with filter `interactive`. It lists four switches with ids `readingEnabled`, `listeningEnabled`, `understandingEnabled`, `writingEnabled`, but without accessible names; `find` with the label text resolves each one. Their labels are `Reading`, `Listening`, `Understanding`, `Writing`, all on, plus buttons `Cancel` and `Add to Study List`. The hints under the labels read `See the characters, type the pinyin.`, `Hear it spoken, type the pinyin.`, `See the characters, recall the meaning.`, `Read the meaning, type the characters.`
- **All modes off.** Turn every switch off. Run `computer` `left_click` on each of the four switch refs. The note changes to `Pick at least one mode — otherwise there's nothing to review.` and `Add to Study List` is disabled. Turn `Understanding` back on. The note returns to the sentence starting `The parts of each word are always included` and the button enables.
- **Save from the card.** Leave all four switches on and choose `Add to Study List`. Run `find` with `Add to Study List button`, then `computer` `left_click` on that ref. The button reads `Saving...` while pending. A toast reads `Deck added to your study list!`, the dialog closes, the card shows a `Saved` pill, the footer button now reads `Study Settings`, and the learner count still reads `0 learners` until `/decks` reloads, because the card does not refetch after the save.
- **After screenshot.** Run `computer` `screenshot` with `save_to_disk` set. The card shows `Saved` and `Study Settings`.
- **Edit settings from the card.** Choose `Study Settings`. Run `find` with `Study Settings button`, then `computer` `left_click`. The dialog is titled `Update Study Settings` and the confirm button reads `Save Settings`. Turn `Writing` off and choose `Save Settings`. The toast reads `Study settings updated!`
- **Saved list.** Run `navigate` with `http://localhost:PORT/study`. The `h1` is `My study decks` with the subtitle `Watch each deck grow, and pick up wherever you left off.` A card titled `HSK 1` carries a link `Start studying` and an icon button with `aria-label` `Study settings for HSK 1`. That button opens a dialog titled `Update study settings` whose confirm button reads `Update settings`. With no saved decks the page shows `No decks yet` and a `Browse decks` button instead.
- **Deck detail list.** Run `navigate` with `http://localhost:PORT/decks/<id>`. Run `get_page_text`. A `Back to Decks` link sits above the `h1` `HSK 1`. The header action is a button `Save Deck`. The stat row reads `@Verify Learner`, `N items`, `1 learner`. Under the heading `What's inside` the text reads `Smallest pieces first, the way you'll learn them. Every part a character is built from is included.` Cards are titled `Components` and `Characters`, each followed by its count. Every chip is a link to `/dictionary/<glyph>` whose `title` is the translation, with a pinyin or gloss line under the glyph. A chip with audio has a button labeled `Play <glyph>`, for example `Play 人`. A group longer than its preview shows `Show all N`, which becomes `Show fewer` once open.
- **Graph toggle.** Run `find` with `Deck view group`. It is a `group` with `aria-label` `Deck view` containing buttons `List` and `Graph` with `aria-pressed`. Run `computer` `left_click` on `Graph`. The container widens, the text under `What's inside` becomes `How the deck is built: every part points at what it helps build.`, and the panel shows `Building graph…` until the canvas renders. A legend at the bottom reads `Component`, `Character`, `Word` followed by `N of N items · K links · click to open`.
- **Depth control.** Run `get_page_text`. Above the canvas the label `Levels deep` sits over the text `Each level unlocks once everything it is built from is known.` Run `find` with `Levels deep group`. It is a `group` with `aria-label` `Levels deep` whose buttons are `1`, `2`, and so on, with the last labeled `All`. Each carries a `title` of the form `First 1 of 3 levels` or `All 3 levels`. Choose `1`. The legend's first number drops to the count of level-0 items and the link count drops to `0 links`, since level 0 has no prerequisites inside the deck. Choose `All` to restore the full count. The control is absent when the deck has a single level.
- **Save from the deck page.** Choose `Save Deck`. Run `find` with `Save Deck button`, then `computer` `left_click`. The dialog is titled `Add Deck to Study List` with the description `Configure your study settings for this deck.` and the confirm button `Add to Study List`. This dialog always opens with all four modes on, even for a deck already saved. Choose `Add to Study List`. The toast reads `Deck added to your study list!` and the same `user_decks` row is updated in place with the dialog's four values.
- **Curl save.** Sign in and reuse the cookie jar (see `deck-create.md` for the sign-in command). Run
  `curl -s -b jar.txt -w '\n%{http_code}\n' -H 'content-type: application/json' -d '{"json":{"deckId":"<id>","readingEnabled":true,"listeningEnabled":true,"understandingEnabled":true,"writingEnabled":false}}' http://localhost:PORT/api/rpc/study/addDeck`.
  The body is `{"json":{"success":true}}` and the status is `200`. All five fields are required. Without the cookie the status is `401`.
- **Curl browse.** Run `curl -s -b jar.txt -H 'content-type: application/json' -d '{"json":{"search":"HSK","page":1,"perPage":12}}' http://localhost:PORT/api/rpc/decks/browse`. The body contains `"deckName":"HSK 1"` and `"pagingInfo":{"page":1,"perPage":12,"total":1}`.
- **Database proof.** Run `psql "$DATABASE_URL" -c "select user_id, deck_id, include_constituents, reading_enabled, listening_enabled, understanding_enabled, writing_enabled from user_decks where deck_id = '<id>';"`. Exactly one row exists, `user_id` is the learner's `users.id`, `include_constituents` is `t`, and the four mode columns match the last dialog or `curl` values. Then run `psql "$DATABASE_URL" -c "select count(*) from user_vocab_items where user_id = (select id from users where email = 'verify@hanzimind.test');"`. The count equals `select count(*) from deck_vocab_items where deck_id = '<id>'`, because saving seeds one progress row per deck item.
- **Proof.** Keep the before and after screenshots of the card, the `get_page_text` output showing `Deck added to your study list!` or the `Saved` pill, the `curl` output with status, and both `psql` results. Record `deck-browse-and-save.md` and the sub-feature ID with each artifact.

## Gotchas

- The search runs on Enter only. Typing alone does nothing and there is no search button. Read the heading, which changes to `Results for “<query>”`, before asserting on the cards.
- The results heading and the search empty state use curly quotes around the query. Match them as rendered.
- `Save to Study List` on a card is disabled until the learner's saved list has loaded. If `find` reports it disabled on first paint, wait and re-run `read_page`.
- Saving is an upsert. Saving the same deck twice never fails and never adds a second `user_decks` row. It overwrites the four mode columns with whatever the dialog held.
- The deck page's `Save Deck` dialog does not read existing settings. For a saved deck it opens with all four modes on, and confirming it silently resets the learner's choices. Use the card's `Study Settings` or `/study` to edit settings without that side effect.
- There is no unsave in the UI and no endpoint removes a `user_decks` row. Reset a lane, or delete the row with `psql`, before re-running a recipe that expects an unsaved card.
- The learner count on the card counts `user_decks` rows for that deck, but the card does not refetch after a save, so it reads `0 learners` until `/decks` reloads. Reload, then read `1 learner`.
- The card's whole surface is an overlay link to the deck page. Clicking anywhere except the footer button navigates away. Aim `find` at the button.
- The two composition bars build their accessible names differently. The card on `/decks` pluralises by count, so one component reads `1 component`. The bar on the deck page lowercases the group heading, so the same deck reads `1 components` there. Match each page's own form.
- The graph is a canvas. `find` and `read_page` cannot see nodes. Prove the graph through the legend text, the depth buttons, the screenshot, and by clicking a node, which navigates to `/dictionary/<glyph>`.
- The depth control only renders when the deck has at least two levels. The `Verify deck` built from `deck-create.md` has parts inside it, so it has more than one level and the control appears.
- Pagination cannot be exercised without thirteen decks. Report `deck-browse-paging` as verified only for the disabled state unless the lane holds that many.
- The browse list and the saved list are cached for a minute. After a `curl` save, reload `/decks` and `/study` before reading the `Saved` pill or the card.
