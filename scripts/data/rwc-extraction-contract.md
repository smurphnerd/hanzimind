# RWC entry extraction contract

You are extracting structured entries from _Reading and Writing Chinese_ (McNaughton,
Tuttle). Each input file holds many entry blocks, one per character, delimited by:

```
━━━ ENTRY <n> | serial=<s> | glyph=<char> ━━━
```

`glyph=` and `serial=` are already resolved for you — copy them through verbatim.

A header may show `glyph=?`. This means the headword was a printed image the pipeline
could not resolve to Unicode — it does NOT mean the block is a note. Decide by content:

- If the block is a real entry (it has a `serial=` and/or a normal head-gloss with a
  reading and definition), EMIT it with `"glyph": null`. Do not read or guess the glyph
  from the prose or compounds — a central pass fills these deterministically later.
- Only SKIP a `glyph=?` block when it is a genuine non-entry note: no serial, no reading
  — e.g. "No pronunciation. Radical (N) ..." remarks or a bare "leftover/227th-category"
  line. When unsure, EMIT with `"glyph": null` rather than skip.

## The book's 15-part entry key (from the Student's Guide)

```
1 the character      2 serial number     3 stroke count       4 stroke-order diagram
5 pronunciation      6 definition        7 radical info       8 radical number
9 HSC list (A–D)    10 New HSK level      11 explanation       12 (MN) mnemonic tip
13 combinations     14 traditional form  15 radical ref
```

Extract ONLY parts 1, 2, 5, 6, 7, 8, 10, 11, 12. Ignore 3, 4, 9, 13, 14, 15 —
that means: ignore stroke data, the bracketed `[A]`/`[B]`/`[C]`/`[D]` HSC list tag,
the compound/combination lines (a Chinese word followed by pinyin and a gloss),
the traditional-form glyph, and radical-disambiguation refs.

## What each entry block looks like

Line 1 is `⟦IMG⟧` (the headword was an image; you already have it as `glyph=`).
The next line is the head-gloss, e.g.:

```
NǙ, woman. WOMAN radical (73) [A]
```

- `NǙ` → pinyin (part 5). Preserve tone marks. A head may list several readings
  (`ZHÈI, ZHÈ`) or several with glosses (`GĚI ... ; JǏ, to supply`) — capture the
  primary reading(s) as written, comma-joined.
- `woman` → definition (part 6). Everything after the reading up to the radical
  clause or the `[A]`/`L1` tags. Keep the English gloss; drop the `[A]` list tag and
  the `L1` HSK tag from this string.
- `WOMAN radical (73)` → radicalName="WOMAN", radicalNumber=73 (parts 7, 8). Present
  only when the character is itself a radical; otherwise both null.
- `L1`..`L6` anywhere in the head → hsk (part 10) as an integer 1–6, else null.

Then zero or more prose paragraphs = the explanation (part 11). This is the
etymology/history/mnemonic story — the valuable text. Capture it verbatim as one
string (join multiple paragraphs with "\n\n"). EXCLUDE:

- compound lines (Chinese word + pinyin + gloss), and
- pure cross-reference sentences that only say "Distinguish from X (123, p. 45)" when
  they stand alone — but KEEP such a clause if it is part of a larger explanatory
  paragraph.

A line beginning `(MN)` is McNaughton's mnemonic (part 12). Extract its text
(without the `(MN)` prefix) into `mnemonic`, and do NOT also include it in
`explanation`. If there is no `(MN)` line, `mnemonic` is null.

`isRadical` = true when the head-gloss names a radical (parts 7/8 present).

## Output

Append one JSON object per real entry to your output shard, one per line (JSONL).
Preserve input order. Schema:

```json
{
  "serial": 73, // integer, or null for Part 2 unnumbered entries
  "glyph": "女", // copied from the header
  "pinyin": "nǚ", // lowercase reading with tone marks; multiple joined by ", "
  "definition": "woman", // English gloss, list/HSK tags stripped
  "radicalName": "WOMAN", // or null
  "radicalNumber": 73, // integer, or null
  "hsk": 1, // 1–6, or null
  "isRadical": true,
  "explanation": "<the entry's explanation paragraphs, verbatim>", // or null
  "mnemonic": null // (MN) text, or null
}
```

Do not invent content. If a field is absent, use null. Copy Chinese characters and
tone marks exactly. Every non-skipped entry block must produce exactly one line.
