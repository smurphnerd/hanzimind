# Admin suggestions

A signed-in learner reports a problem with a dictionary entry or with one of its memory aids from a `Report a problem` dialog. The report picks one of six kinds, carries free text up to 1000 characters, and lands as an open suggestion. An admin works the queue at `/admin/suggestions`, which counts suggestions by status, lists them newest first with the filer and the glyph they are about, and lets the admin resolve, reject, or reopen each one with an optional note. A signed-out reader can open the dialog but is asked to sign in before the form appears.

## Sub-features

- `suggest-open-entry` opens the dialog from `Report or suggest an improvement` under an entry's definition.
- `suggest-open-aid` opens the dialog from the flag button on a memory aid, with `A memory aid is a problem` preselected.
- `suggest-anon` shows the sign-in prompt inside the dialog to a signed-out reader.
- `suggest-kinds` offers six radio choices and defaults to `The meaning is wrong`.
- `suggest-body` counts characters against `1000` and keeps `Send report` disabled while the text is blank or over the limit.
- `suggest-send` submits the report, shows `Thanks! We'll take a look.`, and closes the dialog.
- `suggest-rate-limit` refuses the eleventh report inside an hour with an informational toast.
- `admin-sugg-gate` refuses a learner and a signed-out visitor the same way `admin-vocab.md` describes.
- `admin-sugg-counts` shows `Open`, `Resolved`, `Rejected`, `All` with a count on each.
- `admin-sugg-list` shows the glyph, definition, type badge, kind label, status pill, body, filer and date for each suggestion.
- `admin-sugg-empty` shows `Nothing to review` when a bucket is empty.
- `admin-sugg-resolve` marks a suggestion resolved with a note.
- `admin-sugg-reject` marks a suggestion rejected.
- `admin-sugg-reopen` returns a closed suggestion to open and clears the reviewer stamp.
- `admin-sugg-paging` walks 25 rows a page with `Previous` and `Next`.

## How to get to it (user POV)

- Open a dictionary entry such as `http://localhost:PORT/dictionary/亻` and choose `Report or suggest an improvement` under the definition.
- On the same entry, choose the flag button on a listed memory aid.
- Open `View all (N)` on an entry with more than ten memory aids and choose the flag button on an aid inside that dialog.
- Sign in as an admin, open the `Admin` menu in the header and choose `Suggestions`.
- Open `http://localhost:PORT/admin/suggestions` directly.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up on `PORT` and the seed loaded the dictionary with `SEED_TEST_USER=1`.
- The learner account is `verify@hanzimind.test`, password `verify-hanzimind`, role `user`. It files reports and must be refused at `/admin/suggestions`.
- The admin account is `verify-admin@hanzimind.test`, password `verify-hanzimind`, role `admin`.
- The `suggestions` table is empty on a fresh seed, so the queue starts at `Nothing to review`.
- The entry `亻` exists. A memory-aid bullet needs one aid on it, created through `memory-aids.md` or the admin dialog in `admin-vocab.md`.
- Sign in through the form in `sign-in.md`, or with the `curl` sign-in command in `../SKILL.md` for the API bullet.
- The browser viewport is at least `640px` wide so the header nav is visible.

- **Anonymous dialog.** With no session, run `navigate` to `http://localhost:PORT/dictionary/亻`. Run `find` with query `Report or suggest an improvement button`, then `computer` `left_click`. A dialog titled `Report a problem` opens whose description reads `About 亻.` followed by `Every report is read by a human`. Instead of a form it shows the text `Reports are tied to an account so we can follow up on them.` with `Cancel` and `Sign in` buttons. Run `read_page` with filter `interactive`. The `Sign in` link's href starts with `/signin?redirectUrl=%2Fdictionary%2F` and encodes the current path, so the reader is returned to the entry. No radio group and no text area are present.
- **Open from the entry.** Sign in as `verify@hanzimind.test` and return to `/dictionary/亻`. Click `Report or suggest an improvement` again. The dialog now shows six radio options labeled `The meaning is wrong`, `The reading is wrong`, `The breakdown is wrong`, `The audio is wrong`, `A memory aid is a problem`, `Something else`, a text area under the label `What's wrong?`, a counter reading `0/1000`, and the buttons `Cancel` and `Send report`. `The meaning is wrong` is selected. `Send report` is disabled.
- **Pick a kind.** Run `find` with query `radio labeled The reading is wrong`, then `computer` `left_click`. The radio ids follow `report-kind-<kind>`, so `report-kind-pinyin` is the one selected. Its card gains the highlighted border.
- **Type the body.** Run `find` with query `text area labeled What's wrong?`, then `computer` `left_click` and `type` `Verify run: the tone mark looks wrong.` The text area has id `report-body` and placeholder `Tell us what you'd expect to see instead…`. The counter reads `38/1000` and `Send report` becomes enabled. Run `computer` `screenshot` with `save_to_disk` true.
- **Send.** Run `find` with query `Send report button`, then `computer` `left_click`. The button reads `Sending…` briefly, a toast reads `Thanks! We'll take a look.`, and the dialog closes. Run `computer` `screenshot` with `save_to_disk` true.
- **Open from a memory aid.** With at least one aid listed under `Memory Aids`, run `find` with query `button labeled Report this memory aid`, then `computer` `left_click`. The dialog description reads `About` followed by the aid's text, and `A memory aid is a problem` is preselected. Choose `Cancel` to close without filing, or file it to give the admin queue a memory-aid row.
- **API report.** Sign in as the learner with `curl` and reuse `jar.txt`. Read the target id with `psql "$DATABASE_URL" -Atc "select id from vocab_items where vocab_item = '亻'"`. Run `curl -s -i -b jar.txt -H 'content-type: application/json' -X POST http://localhost:PORT/api/rpc/suggestions/create -d '{"json":{"kind":"translation","body":"Verify run: filed over the API.","vocabItemId":"<id>","memoryAidId":null}}'`. HTTP `200` and a body whose `json` object has `kind` `translation`, `status` `open`, `adminNote` `null`, the same `vocabItemId`, and a fresh `id`. Keep that `id` for the proof.
- **Learner refused at the queue.** Still signed in as the learner, run `navigate` to `http://localhost:PORT/admin/suggestions`. The card reads `Admins only` with `Your account doesn't have admin access.` and a `Back home` button. Signed out, the same URL shows `Sign in required` with a `Sign In` link to `/signin?redirectUrl=admin%2Fsuggestions`.
- **Queue and counts.** Sign in as `verify-admin@hanzimind.test`. Run `find` with query `Admin menu button in the header`, `computer` `left_click`, then click the `Suggestions` item. The heading is `Suggestions`. Run `get_page_text`. The buttons `Open`, `Resolved`, `Rejected`, `All` each carry a number. `Open` is active and its number equals the reports filed above.
- **Row contents.** In the `Open` list the newest report is first. Its card shows the glyph `亻` as a link to `/dictionary/亻`, the entry's definition, the type badge `Comp`, the kind label `Meaning` for a `translation` report or `Reading` for a `pinyin` one, a status pill whose DOM text is `open`, the body text, and a line with the filer's name and `(verify@hanzimind.test)` and the filed date. A report about a memory aid also quotes the aid's text in italics.
- **Admin note.** Run `find` with query `text area labeled Admin note on the first suggestion`, then `computer` `left_click` and `type` `Checked against the dictionary.` The placeholder is `Note for the record (optional)`. Nothing is saved yet.
- **Resolve.** Run `find` with query `Resolve button on the first suggestion`, then `computer` `left_click`. The button sends `admin.setSuggestionStatus` with `{"id": "<id>", "status": "resolved", "adminNote": "Checked against the dictionary."}`. A toast reads `Marked as resolved`, the card leaves the `Open` list, the `Open` count drops by one, and the `Resolved` count rises by one. Run `computer` `screenshot` with `save_to_disk` true.
- **Resolved bucket.** Click `Resolved`. The card is listed with the status pill `resolved`, the note text in its `Admin note` box, and the buttons `Reopen` and `Reject`. `Resolve` is absent.
- **Reject.** Click `Reject` on that card. A toast reads `Marked as rejected` and the card moves to `Rejected`, where its buttons are `Reopen` and `Resolve`.
- **Reopen.** In `Rejected`, click `Reopen`. A toast reads `Marked as open` and the card returns to `Open` with all of `Reject` and `Resolve` shown and no `Reopen`.
- **Empty bucket.** With every report open, click `Resolved`. The list shows `Nothing to review` and `No suggestions in this bucket.` With no open reports the `Open` bucket reads `No open suggestions — the garden is tidy.`
- **Paging.** Only reachable with more than 25 rows in a bucket. File them over the API, then run `find` with query `Next button under the list` and `computer` `left_click`. The range line advances from `1–25 of N` to `26–N of N`. Otherwise report the paging sub-feature as not exercised.
- **Proof.** Each report is one `suggestions` row and each review rewrites it. Read it back with `psql "$DATABASE_URL" -c "select id, kind, body, status, admin_note, vocab_item_id, memory_aid_id, created_by_id, resolved_by_id, resolved_at from suggestions order by created_at desc"`. After `Resolve`, `status` is `resolved`, `admin_note` holds the note, `resolved_by_id` is the admin's `users.id`, and `resolved_at` is set. After `Reopen`, `status` is `open` and both `resolved_by_id` and `resolved_at` are `null` while `admin_note` keeps its value.

## Gotchas

- The dialog checks the session before showing the form. A reader who signs in from the dialog's `Sign in` link is returned to the entry and must open the dialog again.
- The status pill is styled with CSS `capitalize`, so the DOM text is lowercase `open`, `resolved`, `rejected`. Assert on the lowercase form in `get_page_text`.
- `Send report` stays disabled while the body is blank or beyond `1000` characters. The counter turns red over the limit and no request is sent.
- The learner is limited to `10` reports an hour. The eleventh shows the toast `You've sent a lot of suggestions in the last hour — try again later.` and the dialog stays open. The limit counts rows in `suggestions`, so deleting rows resets it.
- The admin note is sent with whichever status button is pressed next. Typing a note alone saves nothing. An empty note on submit clears any earlier note, because the field is always sent.
- Reopening clears `resolved_by_id` and `resolved_at` but not `admin_note`.
- Which buttons a card shows depends on its status. `Reopen` is absent on an open card, `Reject` on a rejected one, and `Resolve` on a resolved one.
- The admin `Reading` kind label maps to a `pinyin` report, `Meaning` to `translation`, `Breakdown` to `decomposition`, `Memory aid` to `memoryAid`. The wire value and the label differ.
- The queue endpoints refuse on their own. A learner cookie against `admin/listSuggestions` or `admin/setSuggestionStatus` gets HTTP `403` with `code` `FORBIDDEN`; no cookie gets HTTP `401` with `code` `UNAUTHORIZED`. `suggestions/create` needs a session and answers `401` without one.
- A bad `vocabItemId` in the API call returns HTTP `500` with the fixed message `Failed to record the suggestion`. Read the id from the database rather than guessing.
- Reports leave rows in `suggestions`. They do not clean up. Delete them with `psql "$DATABASE_URL" -c "delete from suggestions where body like 'Verify run:%'"` at the end of the run so counts start from zero next time.
- The paging range uses the characters the page prints. Match `of` and the numbers rather than the separator between them.
