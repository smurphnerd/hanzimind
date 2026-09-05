# Admin vocab

An admin edits the dictionary in place at `/admin/vocab`. The page lists every vocab row, hidden ones included, with filters by type, script, search text and hidden state. Each row has inline fields for the reading and the definition, a button that opens the memory-aid curation dialog, and three independent switches. `Component` reclassifies a single glyph between character and component. `Phonetic` says whether a component's own reading is taught. `Hidden` removes the row from every learner-facing read path. The same controls appear as an `Admin controls` card on the dictionary entry page when the viewer is an admin. A learner or a signed-out visitor sees a refusal card instead of the table.

## Sub-features

- `admin-vocab-gate-anon` shows `Sign in required` to a signed-out visitor with a `Sign In` link back to the page.
- `admin-vocab-gate-user` shows `Admins only` to a signed-in learner with a `Back home` link.
- `admin-vocab-nav` exposes an `Admin` menu in the header for an admin with `Vocabulary` and `Suggestions` entries.
- `admin-vocab-table` lists rows with the columns `Glyph`, `Type`, `Script`, `Reading`, `Definition`, `Aids`, `Component`, `Phonetic`, `Hidden`.
- `admin-vocab-filter-type` narrows by `All`, `Components`, `Characters`, `Words`, `Sentences`, each showing its count.
- `admin-vocab-filter-script` narrows by `Any script`, `Simplified`, `Traditional`, `Same in both`.
- `admin-vocab-search` matches glyph, reading or definition after Enter.
- `admin-vocab-hidden-only` narrows to disabled rows only.
- `admin-vocab-paging` walks 50 rows a page with `Previous` and `Next`.
- `admin-vocab-edit-definition` saves a definition on Enter or blur and refuses a blank one.
- `admin-vocab-edit-reading` saves a reading on Enter or blur and allows a blank one.
- `admin-vocab-phonetic` toggles whether a component's sound is taught without touching its stored reading.
- `admin-vocab-reading-independent` shows that editing the reading never flips `Phonetic`, and toggling `Phonetic` never changes the reading.
- `admin-vocab-component` reclassifies a glyph between character and component.
- `admin-vocab-hidden` hides a row so the dictionary no longer serves it.
- `admin-vocab-aids` opens the memory-aid dialog, adds a curated aid and stars it as the official pick.
- `admin-vocab-inline` offers the same edits on `/dictionary/[word]` inside the `Admin controls` card.

## How to get to it (user POV)

- Open `http://localhost:PORT/admin/vocab` directly.
- Sign in as an admin, open the `Admin` menu in the header and choose `Vocabulary`.
- Sign in as an admin and open any dictionary entry such as `http://localhost:PORT/dictionary/亻`. The `Admin controls` card sits under the entry header.
- Click a glyph in the admin table. It links to that entry's dictionary page.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up on `PORT` and the seed loaded the dictionary with `SEED_TEST_USER=1`.
- The admin account is `verify-admin@hanzimind.test`, password `verify-hanzimind`, role `admin`.
- The learner account is `verify@hanzimind.test`, password `verify-hanzimind`, role `user`, and must be refused.
- The rows named below exist from the seed. `亻` is a meaning-only component with its stored reading `rén` hidden. `艮` is a phonetic component with reading `gěn`. `人` is a character.
- Sign in through the form in `sign-in.md`, or with the `curl` sign-in command in `../SKILL.md` for the API bullet.
- The browser viewport is at least `640px` wide. The header nav, including the `Admin` menu, is hidden below that.

- **Signed-out refusal.** Open the page with no session. Run `navigate` to `http://localhost:PORT/admin/vocab`. A card shows the heading `Sign in required`, the text `Sign in with an admin account to manage HanziMind.`, and a `Sign In` link. Run `read_page` with filter `interactive`. The link's href is `/signin?redirectUrl=admin%2Fvocab`. No table is rendered.
- **Learner refusal.** Sign in as `verify@hanzimind.test`, then run `navigate` to `http://localhost:PORT/admin/vocab`. The card heading is `Admins only`, the text is `Your account doesn't have admin access.`, and the only button is `Back home` linking to `/`. Run `get_page_text` and confirm `Vocabulary` and the column heading `Glyph` are absent.
- **Admin menu.** Sign out, sign in as `verify-admin@hanzimind.test`, and stay on `/`. Run `find` with query `Admin menu button in the header`, then `computer` `left_click` on the ref. Two menu items appear, `Vocabulary` and `Suggestions`. Click `Vocabulary`. The URL is `/admin/vocab` and the page heading is `Vocabulary`.
- **Table loads.** On `/admin/vocab` run `get_page_text`. The heading `Vocabulary` is followed by the intro paragraph, the type buttons `All`, `Components`, `Characters`, `Words`, `Sentences` each with a number, and the table headings `Glyph`, `Type`, `Script`, `Reading`, `Definition`, `Aids`, `Component`, `Phonetic`, `Hidden`. `Components` is the active filter on first load, so every `Type` cell reads `Comp`.
- **Type filter.** Click `Characters`. Run `find` with query `Characters filter button`, then `computer` `left_click`. The `Type` cells change to `Char`, the range line under the table restarts at `1`, and the `Component` column shows a switch on every row while the `Phonetic` column shows a dash.
- **Script filter.** Click `Simplified`. Run `find` with query `Simplified script filter button`, then `computer` `left_click`. Every `Script` cell reads `Simp`. Click `Any script` to reset.
- **Search.** Click `All`, then click the search box. Run `find` with query `search box with placeholder Search glyph, reading or definition`, then `computer` `left_click`, `type` `人`, and `key` `Enter`. Nothing changes until Enter. After Enter the table holds the rows whose glyph, reading or definition contains `人`, and the first `Glyph` cell is `人`. Clear the box and press Enter to restore the full list.
- **Hidden only.** Turn on the switch beside the text `Hidden only`. It has no `aria-label`; its accessible name is the label text followed by the count badge, so run `find` with query `switch next to Hidden only` and `computer` `left_click` on the ref. The table shows only rows drawn at reduced opacity whose `Hidden` switch is on, and the range total equals the number in the `Hidden only` badge. Turn it off again.
- **Paging.** With `All` selected, run `find` with query `Next button under the table` and `computer` `left_click`. The range line advances from `1–50 of N` to `51–100 of N` and `Previous` becomes enabled. Click `Previous` to return.
- **Edit definition.** Filter to `Components` and search `亻`. Run `find` with query `text box labeled Definition for 亻`, then `computer` `left_click`, select all with `key` `cmd+a`, `type` `person (side form)`, and `key` `Enter`. A toast reads `Updated 亻` and the cell shows the new text after the refetch. Run `computer` `screenshot` with `save_to_disk` true before and after. The seeded definition is `man, person; people`. Restore it the same way once the proof is captured.
- **Blank definition refused.** Clear the same field and press Enter. Run `computer` `left_click` on the ref, `key` `cmd+a`, `key` `Backspace`, `key` `Enter`. The field snaps back to the saved value and no toast appears. No request is sent for this case.
- **Edit reading.** Run `find` with query `text box labeled Reading for 艮`, then `computer` `left_click`, `key` `cmd+a`, `type` `gèn`, and `key` `Enter`. A toast reads `Updated 艮`. The `Phonetic` switch for `艮` stays on. Restore `gěn` the same way.
- **Phonetic on a meaning-only component.** Run `find` with query `switch labeled Teach the sound of 亻`, then `computer` `left_click`. A toast reads `Updated 亻` and the switch is on. The `Reading` cell for `亻` still shows `rén`, unchanged. Run `navigate` to `http://localhost:PORT/dictionary/亻`. The entry header badge reads `Meaning + sound` and the reading `rén` is shown. Toggle the switch off again on `/admin/vocab` and reload the entry. The badge reads `Meaning only`, the reading is gone, and the header text starts `A part used to build other characters`.
- **Reading and phonetic are independent.** After the two bullets above, run `get_page_text` on `/admin/vocab` with `亻` in view. The `Reading` cell for `亻` is `rén` and its `Phonetic` switch is off. Editing one never changed the other.
- **Component toggle.** Search `人` with `All` selected. Run `find` with query `switch labeled Mark 人 as a component`, then `computer` `left_click`. A toast reads `Updated 人`, the `Type` cell becomes `Comp`, and a `Phonetic` switch appears in that row. Click the same switch again. The `Type` cell returns to `Char` and the `Phonetic` cell returns to a dash.
- **Hide a row.** Run `find` with query `switch labeled Hide 人`, then `computer` `left_click`. A toast reads `Updated 人` and the row stays listed at reduced opacity with the switch on. Run `navigate` to `http://localhost:PORT/dictionary/人`. The entry does not render. The page shows the error card `Something went wrong` with a `Try again` button, because `vocab.get` answers `NOT_FOUND` for a hidden row. Return to `/admin/vocab`, search `人`, and turn the `Hide 人` switch off. The entry page loads again.
- **Memory aids.** Search `亻` and run `find` with query `button labeled Manage memory aids for 亻`, then `computer` `left_click`. A dialog titled `Memory aids 亻` opens. On a fresh seed it reads `No memory aids yet. Add the first curated one below.` Run `find` with query `text area with placeholder Add a curated memory aid`, `computer` `left_click`, `type` `A person standing at the side.`, then `find` with query `Add aid button` and `computer` `left_click`. The aid appears in the list with the caption `0 saved • by` followed by the admin's name.
- **Official pick.** In the same dialog, run `find` with query `button labeled Make official pick`, then `computer` `left_click`. The aid gains an `Official` badge and the button's label becomes `Remove official pick` with `aria-pressed` true. Close the dialog with the `Close` button. On `/dictionary/亻` the aid shows first with the caption `Official pick`.
- **Inline editor on the entry.** Run `navigate` to `http://localhost:PORT/dictionary/艮` as the admin. Run `get_page_text`. A card titled `Admin controls` shows the labels `Reading` and `Definition`, the switch labels `Component`, `Phonetic`, and `Hidden`, and a `Manage memory aids` button. The inputs carry the same `aria-label`s as the table, `Reading for 艮` and `Definition for 艮`, and the switches carry `Mark 艮 as a component`, `Teach the sound of 艮`, and `Hide 艮`. Edit the definition here with `computer` `left_click`, `key` `cmd+a`, `type`, and `key` `Enter`. A toast reads `Updated 艮` and the entry's definition updates in place. The `Hidden` switch here is always off. Turning it on shows the toast `Hid 艮` and routes to `/dictionary`.
- **API edit.** Sign in as the admin with `curl` into `admin-jar.txt` and reuse it. Read the row id with `psql "$DATABASE_URL" -Atc "select id from vocab_items where vocab_item = '亻'"`. Run `curl -s -i -b admin-jar.txt -H 'content-type: application/json' -X POST http://localhost:PORT/api/rpc/admin/updateVocabItem -d '{"json":{"id":"<id>","translation":"person (side form)","phonetic":false}}'`. HTTP `200` and a body whose `json` object has `vocabItem` `亻`, `translation` `person (side form)`, `phonetic` `false`, `disabled` `false`, and the unchanged `pinyin` `rén`.
- **Proof.** Every switch and field above writes to `vocab_items`. Read the row back with `psql "$DATABASE_URL" -c "select vocab_item, vocab_type, pinyin, translation, phonetic, disabled, default_memory_aid_id from vocab_items where vocab_item in ('亻','艮','人')"`. The starred aid is the `memory_aids` row whose id is in `default_memory_aid_id`, readable with `psql "$DATABASE_URL" -c "select id, memory_aid, public, created_by_id from memory_aids where vocab_item_id = (select id from vocab_items where vocab_item = '亻')"`. Pair each with the before and after screenshots.

## Gotchas

- The page gate is presentation only. The endpoints refuse on their own. A learner cookie against any `admin/*` procedure gets HTTP `403` with `code` `FORBIDDEN`, and no cookie gets HTTP `401` with `code` `UNAUTHORIZED`.
- `Components` is the default type filter. A search for a character or a word returns `Nothing matches those filters.` until `All` or the matching type is selected.
- Search commits on Enter only. Typing alone never changes the table.
- The `Hidden only` switch narrows to disabled rows. It is not an include toggle. With it off, hidden rows still appear at reduced opacity, so a freshly hidden row does not disappear from the table.
- Inline fields commit on Enter or blur and revert on Escape. Re-entering the value already saved sends no request and shows no toast. Prefer `computer` `type` and `key` `Enter` over `form_input`, so React sees the change and the blur commit runs.
- The `Component` switch appears only for characters and components. The `Phonetic` switch appears only for components. Turning `Component` off on a component hides its `Phonetic` switch but leaves the stored `phonetic` flag alone, so switch it back and check the flag rather than assuming it reset.
- `Phonetic` and `Reading` are separate columns on the same row. Neither edit touches the other. Verify both in the proof query.
- The `Hidden only` switch and the `Hide <glyph>` switches have different names. Only the row switches carry an `aria-label`.
- The `Hidden` switch inside `Admin controls` is always rendered off, because the entry page never loads a hidden row. Turning it on leaves the page.
- A changed `Phonetic` is provisional. The next `tsx scripts/backfill-classification.ts` run resets it from `vocab-classification.tsv`. Restore the seed state at the end of a run so later features see `亻` as meaning-only.
- Every edit leaves state in the lane database. Reverse each mutation at the end of the run, or reseed the lane, before another feature reads the same glyph.
- The paging range uses the characters the page prints. Match `of` and the numbers rather than the separator between them.
