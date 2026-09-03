# Dictionary

The dictionary lets anyone, signed in or not, search the vocabulary by Chinese text, pinyin, or English meaning, open one entry, hear it, watch its stroke order, see the parts it is built from and which part gave it its sound or its meaning, and switch the entry to a graph of everything one hop away from it.

## Sub-features

- `dict-open` shows the search page with its idle prompt and no results.
- `dict-language` switches between Chinese and English search and changes the placeholder.
- `dict-search-character` returns a character row with its translation, a play control, and a type badge.
- `dict-search-component` returns a component row with a second badge that says what it teaches.
- `dict-search-english` matches on the English translation.
- `dict-search-empty` shows the no-results card for a query nothing matches.
- `dict-row-open` opens an entry from a results row.
- `dict-play-row` plays audio from a results row without leaving the page.
- `dict-entry-header` shows the glyph, the type badge, the reading, and a play button.
- `dict-entry-component` shows the meaning-only or meaning-plus-sound badge and hides the reading for a meaning-only component.
- `dict-entry-definition` shows the definition and the report control.
- `dict-entry-parts` shows the decomposition tiles with sound and meaning captions.
- `dict-entry-origin` shows the etymology note, formation, and radical for a base character.
- `dict-entry-strokes` animates the stroke order and replays it.
- `dict-entry-graph` switches to the graph view and back.
- `dict-entry-back` returns to the search page.
- `dict-api-search` returns the same rows from the search endpoint.

## How to get to it (user POV)

- Open `http://localhost:PORT/dictionary` directly. No sign-in is required.
- Signed in, choose `Dictionary` in the header. The header links render only for a signed-in session, so a signed-out visitor has the URL only.
- Open `http://localhost:PORT/dictionary/<glyph>` directly, for example `/dictionary/人`.
- Click any results row on `/dictionary`.
- Click a part tile on an entry page, which links to that part's own entry.
- Click a node in an entry's graph view, which opens that glyph's entry.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up on `PORT` and `scripts/doctor.sh` passed.
- The lane database was seeded, so 人, 亻, 很, and 艮 exist. 亻 is a meaning-only component. 艮 is a phonetic component. 很 is built from 彳 and 艮.
- Audio proof needs the seed to have generated audio for 人. The seed calls the TTS service over the network and continues without audio on failure, so check `audio_url` in Postgres before asserting playback.

- **Idle page.** Open the search page. Run `navigate` with `http://localhost:PORT/dictionary`. `get_page_text` contains the heading `Dictionary`, the subheading `词典`, and `Search for Chinese characters or English translations to get started`. No table is present.
- **Language toggle.** Note the two language buttons. Run `find` with `English button next to 中文 Chinese`, then `computer` `left_click` on its ref. The input placeholder changes from `Search Chinese characters or pinyin...` to `Search English translation...`. Click `中文 Chinese` to switch back. The active language renders as the filled button and the other as outline. Neither button has `aria-pressed`, so read the placeholder as the proof of which is active.
- **Search 人.** Type 人 and submit. Run `find` with `search input with placeholder Search Chinese characters or pinyin...`, then `form_input` with that ref and value `人`, then `find` with `Search button` and `computer` `left_click` on it. The text `Searching...` appears, then a table with headers `Character`, `Translation`, `Audio`, `Type`. Results sort shortest first, so the first row is 人. That row shows `人`, `man, person; people`, one icon-only button in the `Audio` column, and one badge reading `Char`. No `Meaning only` or `Meaning + sound` badge is on that row, because the role badge renders only for a component. The play button has no `aria-label` and its icon is `aria-hidden`, so its accessible name is empty. `read_page` with filter `interactive` lists it as a button with no name in the 人 row. Locate it with `find` using `play button in the Audio column of the 人 row`.
- **Search 亻.** Replace the query with 亻 and submit. Run `form_input` on the search input with value `亻`, then click `Search`. The results table holds one row. It shows `亻`, `man, person; people`, and two badges in the `Type` column, `Comp` above `Meaning only`. The play button in that row is rendered but `disabled`, because the server blanks the audio of a meaning-only component. `read_page` with filter `interactive` shows it disabled. Clicking it does nothing and shows no toast.
- **Search 艮.** Search for 艮. The 艮 row shows `Comp` above `Meaning + sound`, and its play button is enabled when the seed produced audio for it.
- **English search.** Click `English`, enter `very`, and click `Search`. Run `form_input` on the search input, which now has placeholder `Search English translation...`, with value `very`, then click `Search`. The table contains a row for 很 whose `Translation` cell reads `very, quite, much` and whose badge reads `Char`.
- **Empty state.** Search for a nonsense query. Run `form_input` with value `zzqx` in English mode and click `Search`. A card reads `No results found for “zzqx”`. In Chinese mode a query of Chinese text that is not seeded additionally shows `This word isn’t in the database yet.`
- **Play from a row.** Search 人 again in Chinese mode and click the play button in the 人 row. Run `find` with `play button in the Audio column of the 人 row`, then `computer` `left_click` on the ref. The page does not navigate, and no `Couldn't play audio` toast appears. `read_network_requests` shows a request to the lane's S3 endpoint for a path ending in `audio/20154.mp3`, which is 人's code point in decimal. Playback itself is not observable by the harness, so treat the request plus the absence of the error toast as the proof.
- **Open a row.** Click the 人 cell. Run `find` with `table cell containing 人` and `computer` `left_click` on it. The row is not a link; it sets `window.location`, so the browser does a full page load to `http://localhost:PORT/dictionary/%E4%BA%BA`. The URL bar decodes to `/dictionary/人`. For about fifteen seconds after the load `get_page_text` can return nothing although the page rendered; wait until `find "Back to Dictionary"` returns a ref or take a screenshot, then read again.
- **Entry header for 人.** `get_page_text` on `/dictionary/人` contains `Back to Dictionary`, the glyph `人`, the badge `Character`, the reading `rén`, and a button `Play audio`. `find` with `Play audio button` returns one ref. No `Meaning only` badge is present on a character.
- **Entry header for 亻.** Run `navigate` with `http://localhost:PORT/dictionary/亻`. The header shows the badge `Component` beside `Meaning only`, then the sentence `A part used to build other characters — it has no pronunciation of its own.` No reading and no `Play audio` button render. `find` with `Play audio button` returns nothing. This is the only place the button is absent rather than disabled.
- **Entry header for 艮.** Run `navigate` with `http://localhost:PORT/dictionary/艮`. The header shows `Component` beside `Meaning + sound`, the reading `gěn`, the sentence `A part used to build other characters — its sound is a clue to how they are said.`, and, when the seed produced audio, a `Play audio` button.
- **Definition card.** On `/dictionary/人` the card titled `Definition` reads `man, person; people`, followed by a button `Report or suggest an improvement`. An entry with no translation reads `No definition yet for this entry.` The report flow is covered in `admin-suggestions.md`.
- **Origin card.** On `/dictionary/人` the second visual card is titled `Origin`, because 人 has no parts. It reads `The legs of a human being`, a pill `Pictograph`, and a pill `Radical` followed by `人`.
- **Decomposition tiles.** Run `navigate` with `http://localhost:PORT/dictionary/很`. The card titled `Decomposition` shows two tiles, `彳` and `艮`, joined by `+`. Under 彳 the caption reads `meaning` and under 艮 it reads `sound`. The DOM text is lowercase and CSS renders it in capitals, so match `get_page_text` on the lowercase word. Each tile is a link to `/dictionary/<part>`. Click 艮 and the URL becomes `/dictionary/艮`.
- **Stroke order.** On `/dictionary/人` the card titled `Stroke Order` holds an SVG with role `img` and `aria-label` `Stroke order animation`, plus a button `Replay animation`. Take a `computer` screenshot with `save_to_disk` immediately after load, click `Replay animation`, and take a second screenshot within a second. The two differ, because the strokes redraw. Wait about two seconds and take a third. The glyph is fully drawn.
- **Graph view.** On `/dictionary/人` find the group with `aria-label` `Entry view`. Run `read_page` with filter `interactive`. It lists two buttons, `Details` with `aria-pressed` true and `Graph` with `aria-pressed` false. Click `Graph`. A card titled `Connections` appears, the `Definition`, `Stroke Order`, and `Origin` cards disappear, and the text `Building graph…` shows until the graph loads. When loaded, a legend reads `Component`, `Character`, `Word`, then a count in the form `N connections · click to open`, where N is one less than the number of nodes. `Graph` now has `aria-pressed` true. The graph is a canvas, so prove it with a screenshot and the legend text, not with `find`.
- **Graph node click.** Click a node in the canvas with `computer` `left_click` at its coordinates from the screenshot. The URL changes to that glyph's entry. Nodes are drawn on canvas and have no refs.
- **Back to details.** Click `Details`. The `Definition` card returns and `Connections` is gone.
- **Back link.** Click `Back to Dictionary`. Run `find` with `Back to Dictionary link` and `computer` `left_click` on it. The URL is `/dictionary` and the idle prompt shows again, because the query is not preserved.
- **API search.** Run `curl -s -w '\n%{http_code}' -X POST http://localhost:PORT/api/rpc/vocab/search -H 'content-type: application/json' --data-binary '{"json":{"query":"人","searchLanguage":"chinese","page":1,"pageSize":20}}'`. Status `200`. The body is `{"json":{...},"meta":[...]}`. `json.items` is an array sorted shortest first, `json.total` is the match count, and `json.totalPages` is derived from it. The row for 人 is the element whose `vocabItem` is `"人"`. Assert `vocabType` `"character"`, `phonetic` false, `translation` `"man, person; people"`, `pinyin` `"rén"`, and a non-empty `audioUrl` when audio was seeded. `meta` lists the `createdAt` and `updatedAt` positions as dates and carries nothing else.
- **API search for a component.** Repeat with query `亻`. `json.items[0].vocabItem` is `"亻"`, `vocabType` is `"component"`, `phonetic` is false, and both `pinyin` and `audioUrl` are `""`. For query `艮`, `phonetic` is true and `pinyin` is `"gěn"`.
- **API entry.** Run `curl -s -X POST http://localhost:PORT/api/rpc/vocab/get -H 'content-type: application/json' --data-binary '{"json":{"vocabItem":"很"}}'`. `json.constituents` is `["彳","艮"]`, `json.etymologyPhonetic` is `"艮"`, and `json.etymologySemantic` is `"彳"`. An unknown glyph returns status `404` with `json.code` `"NOT_FOUND"`.
- **Proof.** Capture the results table for 人 and the entry header for 亻. Run `computer` screenshot with `save_to_disk` on each, and keep the `get_page_text` output that shows `Char` on the 人 row and `Meaning only` on the 亻 page.

## Gotchas

- The results play button has no accessible name. `find` by role and name fails. Describe its position, or use `read_page` with filter `interactive` and pick the unnamed button in the row.
- The results row is a `tr` with an `onClick`, not a link. `find` with `link 人` fails. Click the cell text instead. The click is a full page load, so wait for the new page before reading it.
- A component row still renders a play button, disabled. Only the entry page omits the button entirely. Do not report a disabled row button as a missing one.
- The language toggle carries no `aria-pressed`. Prove the active language from the placeholder or from the filled button style in a screenshot.
- Pinyin search matches the stored tone-marked string with a substring match. `ren` does not match `rén`. Search `rén` or the glyph.
- The search only fires on submit and trims the query. Typing alone shows nothing. Trailing spaces do not change the result.
- Empty-state and error text use curly quotes and a curly apostrophe. Match on the leading words such as `No results found for` if the quotes cause trouble.
- Component header sentences contain an em dash. Match on `A part used to build other characters` when quoting the whole line is fragile.
- Tile captions and the `Meaning + sound` badge use the same words as the parts labels. On an entry page for a component, `Meaning only` and `Meaning + sound` are header badges. On a character page, `sound` and `meaning` are tile captions. Read the surrounding card title to tell them apart.
- The graph is a canvas. `find` and `read_page` cannot see nodes. Use the legend count and a screenshot. A hub like 口 has hundreds of nodes and takes several seconds to settle.
- The graph fetch fires only when `Graph` is clicked. `read_network_requests` shows `/api/rpc/vocab/graph` after the click, not on page load.
- The stroke animation starts on load and runs for about 0.6 seconds per stroke. Screenshot promptly, or use `Replay animation` to restart it before capturing.
- Audio is served from the lane's S3 endpoint and is allowed by the CSP. Playback cannot be heard by the harness. If `Couldn't play audio` appears as a toast, the object is missing from the bucket even though the row has an `audioUrl`.
- The entry query is `vocab.get` with `memoryAidPage` 1 and `memoryAidPageSize` 10. The same page also renders memory aids, covered in `memory-aids.md`.
- Search returns at most 20 rows and there is no paging control. A wide query such as `一` shows the first 20 by length only. The API response `total` is the true count.
