# Memory aids

A memory aid is a short hook a learner writes on a dictionary entry to make it stick. Anyone can read the public ones on `/dictionary/<glyph>`. A signed-in learner can add their own, which stays private to them. An admin can add curated public aids, star one as the official pick, and see private ones. A signed-out visitor can open the create dialog but the submit is refused.

## Sub-features

- `aid-empty` shows the empty state on an entry with no visible aids.
- `aid-create` creates a private aid from the entry page as the learner.
- `aid-list` shows the created aid in the entry's list with its author and usage.
- `aid-private` hides a learner's private aid from other viewers and from signed-out visitors.
- `aid-signed-out` refuses a signed-out submit and shows the error inside the dialog.
- `aid-view-all` opens the paged dialog once more than ten aids are visible.
- `aid-report` opens the report dialog for one aid.
- `aid-manage-open` opens the admin manage dialog from the entry page.
- `aid-manage-add` adds a curated public aid as admin.
- `aid-manage-star` stars an aid as the official pick and clears it again.
- `aid-official` shows the starred aid first with a star and `Official pick` in the dictionary.
- `aid-api-create` creates an aid through the endpoint and is refused without a session.

## How to get to it (user POV)

- Open `http://localhost:PORT/dictionary/<glyph>` and scroll to the card titled `Memory Aids`. This is the only learner-facing entry point.
- Reach an entry from a `/dictionary` search row, a decomposition tile, or a graph node, as in `dictionary.md`.
- As admin, on the same entry page, choose `Manage memory aids` inside the card titled `Admin controls`.
- As admin, on `/admin/vocab`, choose the row button named `Manage memory aids for <glyph>`. That table is covered in `admin-vocab.md`.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up on `PORT` and `scripts/doctor.sh` passed.
- The learner `verify@hanzimind.test`, display name `Verify Learner`, and the admin `verify-admin@hanzimind.test`, display name `Verify Admin`, exist with password `verify-hanzimind`. Sign in through `/signin` as in `sign-in.md`, one tab per account, or reuse one tab and sign out between roles.
- The lane database is freshly seeded, so 人 has no memory aids. Every bullet below leaves rows in `memory_aids`. Pick a glyph nobody else in this run is using if two recipes share a lane.
- For `curl`, sign in first with `curl -s -c jar.txt -X POST http://localhost:PORT/api/auth/sign-in/email -H 'content-type: application/json' --data-binary '{"email":"verify@hanzimind.test","password":"verify-hanzimind"}'` and pass `-b jar.txt` afterwards. Use a second jar for the admin.
- The entry's id is needed for every write. Read it with `curl -s -X POST http://localhost:PORT/api/rpc/vocab/get -H 'content-type: application/json' --data-binary '{"json":{"vocabItem":"人"}}'` and take `json.id`.

- **Empty state.** Signed in as the learner, run `navigate` with `http://localhost:PORT/dictionary/人`. The card titled `Memory Aids` reads `No memory aids yet`, `Be the first to write a hook that makes this one stick.`, and one button `Create the first one`. Take a `computer` screenshot with `save_to_disk` as the before state.
- **Open the create dialog.** Click `Create the first one`. Run `find` with `Create the first one button` and `computer` `left_click` on the ref. A dialog opens titled `Create Memory Aid for 人` with the description `Write anything that helps you remember this word. This is for your personal use.`, a textarea with placeholder `Enter your memory aid...`, a `Cancel` button, a `Create` button that is disabled while the textarea is empty, and a close control named `Close`.
- **Create an aid.** Enter text and submit. Run `find` with `textarea with placeholder Enter your memory aid...`, then `form_input` with that ref and value `Two legs walking`. `Create` becomes enabled. Click it. Its label reads `Creating...` while pending, then the dialog closes.
- **List after create.** `get_page_text` on the same page now shows, inside `Memory Aids`, the line `1.` followed by `“Two legs walking”`, then `Saved by 0 users • by Verify Learner`. The button `Create the first one` is gone and a button `Create my own` is in its place. No `View all` button appears, because one aid fits on the page. Take the after screenshot.
- **Second view.** Read the row back. Run `psql "$DATABASE_URL" -c "select memory_aid, public, created_by_id from memory_aids where memory_aid = 'Two legs walking';"` against the lane database. One row, `public` is `f`. Signed-in learner aids are created private.
- **Private to the author.** In a tab with no session, run `navigate` with `http://localhost:PORT/dictionary/人`. The `Memory Aids` card shows the empty state again, not `Two legs walking`. The same holds for a tab signed in as the admin, on the entry page. The admin sees it only in the manage dialog, below.
- **Signed out submit.** Still with no session, click `Create the first one`. The dialog opens exactly as for the learner, because the page and the dialog do not check the session. Enter `Anonymous hook` in the textarea and click `Create`. The dialog stays open. A red line reading `Unauthorized` appears above the buttons, between the textarea and `Cancel`. The textarea keeps its text. No toast appears and nothing is written. `read_network_requests` shows `POST /api/rpc/vocab/createMemoryAid` with status `401`. Click `Cancel` to close.
- **Create my own.** Back as the learner, click `Create my own`. Run `find` with `Create my own button` and `computer` `left_click`. The same dialog opens with title `Create Memory Aid for 人`. Add `Person with arms at sides` and click `Create`. The list now has two entries, numbered `1.` and `2.`, both `Saved by 0 users`.
- **Report an aid.** Each aid has an icon button with `aria-label` `Report this memory aid`. Run `find` with `Report this memory aid button for the first aid` and click it. The report dialog opens with the aid's text as its subject. The rest of that flow is `admin-suggestions.md`. Close it.
- **Reach View all.** The page shows ten aids at most and offers `View all` only when the total exceeds what it shows. Create eleven visible aids for the learner with `curl`, one call each, using `curl -s -b jar.txt -X POST http://localhost:PORT/api/rpc/vocab/createMemoryAid -H 'content-type: application/json' --data-binary '{"json":{"vocabItemId":"<id>","memoryAid":"Hook 3"}}'` and so on through `Hook 11`. Reload `/dictionary/人`. The card lists ten aids and a button `View all (11)`.
- **View all dialog.** Click `View all (11)`. A dialog opens titled `Memory aids for 人` with the description `Community-contributed memory aids to help remember this word`. It reads `Loading...` briefly, then lists the aids numbered from `1.`, each with `Saved by 0 users • by Verify Learner` and a `Report this memory aid` button. The footer reads `Page 1 of 1` between a disabled `Previous` and a disabled `Next`. Twenty aids fit on one page, so paging needs 21 aids. With 21, `Next` is enabled and the second page starts at `21.`. Close the dialog with the `Close` control.
- **Admin manage dialog from the entry.** Sign in as the admin and open `/dictionary/人`. A card titled `Admin controls` appears between the entry and `Memory Aids`. Click its button `Manage memory aids`. A dialog opens titled `Memory aids 人` with the description `Star one as the official pick — it shows first in the dictionary and on the study card until a learner writes their own.` The list shows the learner's aids, each with a `Private` badge, the line `0 saved • by Verify Learner`, and a star button with `aria-label` `Make official pick` and `aria-pressed` false. On an entry with no aids at all the list reads `No memory aids yet. Add the first curated one below.`
- **Add a curated aid.** In the manage dialog, run `find` with `textarea with placeholder Add a curated memory aid…` and `form_input` with value `Curated: a person standing`. Click `Add aid`. The textarea clears and the new aid appears in the list with no `Private` badge. Read it back with `psql "$DATABASE_URL" -c "select public from memory_aids where memory_aid = 'Curated: a person standing';"`. `public` is `t`.
- **Star an aid.** Click the star button named `Make official pick` beside the curated aid. Its `aria-label` becomes `Remove official pick`, `aria-pressed` becomes true, and a badge `Official` appears on that aid. Read it back with `psql "$DATABASE_URL" -c "select default_memory_aid_id from vocab_items where vocab_item = '人';"`. It equals that aid's id.
- **Official pick in the dictionary.** Close the manage dialog and reload `/dictionary/人`. The curated aid is first, shown with a filled star instead of a number, and its byline reads `Official pick • by Verify Admin`. In a tab with no session the same aid is visible, because it is public, and the learner's private aids are not. As the learner the curated aid is first and the private ones follow, numbered from `1.`.
- **Clear the star.** Reopen `Manage memory aids` and click `Remove official pick`. The `Official` badge disappears and `aria-pressed` returns to false. After reload the dictionary numbers every aid again.
- **API create.** As the learner, run `curl -s -w '\n%{http_code}' -b jar.txt -X POST http://localhost:PORT/api/rpc/vocab/createMemoryAid -H 'content-type: application/json' --data-binary '{"json":{"vocabItemId":"<id>","memoryAid":"From curl"}}'`. Status `200`. `json.memoryAid` is `"From curl"`, `json.usageCount` is `0`, and `json.createdByUsername` is `"Verify Learner"`.
- **API create signed out.** Repeat without `-b jar.txt`. Status `401`, and the body's `json.code` is `"UNAUTHORIZED"` with `json.message` `"Unauthorized"`. `select count(*) from memory_aids where memory_aid = 'From curl'` is unchanged.
- **API admin list.** With the admin jar, run `curl -s -b admin-jar.txt -X POST http://localhost:PORT/api/rpc/admin/listMemoryAids -H 'content-type: application/json' --data-binary '{"json":{"vocabItemId":"<id>"}}'`. `json.items` includes the learner's private aids, each with `isPublic` false and `isDefault` false. With the learner jar the same call returns status `403` and `json.code` `"FORBIDDEN"`.
- **API star.** With the admin jar, run `curl -s -b admin-jar.txt -X POST http://localhost:PORT/api/rpc/admin/setDefaultMemoryAid -H 'content-type: application/json' --data-binary '{"json":{"vocabItemId":"<id>","memoryAidId":"<aid id>"}}'`. `json.defaultMemoryAidId` echoes the aid id. Send `"memoryAidId":null` to clear it.
- **Proof.** For each mutation keep the before and after screenshots of the `Memory Aids` card, the `get_page_text` that shows the aid text and byline, and the `psql` row.

## Gotchas

- The create dialog never checks the session. It opens for a signed-out visitor and the refusal only shows after `Create` is clicked, as the single word `Unauthorized` inside the dialog. A missing dialog would be a bug. A missing error line after submit would be a bug.
- A learner's aid is private. Proving it in a second tab with a different or no session is the only way to show the visibility rule. Do not expect it in the signed-out view.
- The byline shows `users.name`. The seed names the accounts `Verify Learner` and `Verify Admin`. An account created through `/signup` instead of the seed carries whatever name was typed, so confirm with `select name from users where email = 'verify@hanzimind.test'` if the byline differs.
- The entry page loads ten aids, so `View all (N)` appears only from the eleventh visible aid. The dialog pages by twenty, so `Next` is enabled only from the twenty-first. Both counts are per viewer, because private aids count only for their author.
- The dialog title `Create Memory Aid for 人` has the glyph in the same text node, so `find` with `dialog titled Create Memory Aid` matches without the glyph.
- `Create` is disabled while the textarea is blank or only whitespace. The text is trimmed before it is sent.
- The manage dialog description and the curated textarea placeholder contain an em dash and an ellipsis character. Match on `Star one as the official pick` and `Add a curated memory aid` when the full string is fragile.
- The star toggles. Clicking `Remove official pick` on the starred aid clears the default rather than moving it. Read the `aria-label` before clicking.
- Admin-created aids are public immediately and count toward every viewer's total. Create them last, or subtract them, when a bullet asserts a count for the learner.
- `Manage memory aids` on the entry page is inside `Admin controls`, which renders only for an admin session. The learner never sees it, and the endpoints return `403` for the learner regardless.
- The memory aid list is fetched with the entry through `vocab.get`. After a create, the page refetches. Wait for the list to change rather than reloading, or reload if the list has not updated within a few seconds.
- Report buttons on aids are icon-only with `aria-label` `Report this memory aid`. All of them share the name, so scope `find` to the aid's text.
