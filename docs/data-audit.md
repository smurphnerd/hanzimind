# Pre-launch data audit

Audited 2026-09-28 against a read-only snapshot of production: 9,641 `vocab_items`, one public deck (HSK 1, 398 items), 682 memory aids. Production matches the seed files exactly, with no admin edits, so every fix below can go into a seed file plus a backfill.

Evidence files, beside this one:

- `data-audit/hsk1-deck.tsv`: the 108 HSK 1 deck rows with a problem, each with the current value, a proposed value and a second opinion.
- `data-audit/dictionary-flags.tsv`: 1,536 dictionary rows outside the deck that the triage flagged.
- `data-audit/hsk1-writing-collisions.tsv`: 124 English meanings shared by two or more deck items.

## Status

| Finding                    | State                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Readings                | **Fixed.** `vocab-overrides.tsv` sets 呢 ne, 哪儿 nǎr, 一点儿 yì diǎnr, 多少 duō shao, 谁 shéi, 子 zǐ, 卜 bǔ, 只 zhǐ and 卓 zhuó. The grader needed no change: `split()` keeps letters and tones apart, so `nar3` now matches "nǎr".                                               |
| 2. HSK 1 senses            | **Fixed** for all 108 flagged deck rows except 觉 (finding 7). I reviewed every proposal by hand before it went into the file.                                                                                                                                                     |
| 3. `r2.dev` audio          | Open. This is an operator step: bind a custom domain, then rewrite `audio_url`.                                                                                                                                                                                                    |
| 4. 53 live disabled glyphs | **Fixed** by `scripts/apply-disabled.ts`.                                                                                                                                                                                                                                          |
| 5. Stray alternatives      | **Partly fixed.** "Surname" was dropped from 106 characters whose everyday use is something else. It stays on 152: 17 whose only gloss is a surname, and 135 where the surname is the main use (刘, 陈, 曹). The other-reading and wrong-sense cases are fixed for deck rows only. |
| 6–9                        | Open.                                                                                                                                                                                                                                                                              |

## Launch blockers

### 1. The reading answer key rejects the standard answer on HSK 1 words

`pinyin` holds one reading. It comes from `dictionary.txt` (`pinyin[0]`) for characters and from `scripts/data/hsk1-vocabulary.txt` for words. `pinyinMatches` accepts only that reading. I checked each case below against `pinyinMatches` with tones required:

| Item                | Stored     | Correct                           | Standard answer typed | Accepted |
| ------------------- | ---------- | --------------------------------- | --------------------- | -------- |
| 呢 (HSK 1 particle) | né         | ne                                | `ne`                  | no       |
| 哪儿                | nǎ er      | nǎr                               | `nar3`                | no       |
| 一点儿              | yī diǎn er | yìdiǎnr                           | `yi4dian3r`           | no       |
| 多少                | duō shǎo   | duōshao                           | `duo1shao`            | no       |
| 谁                  | shuí       | shéi (the HSK list's own reading) | `shei2`               | no       |

These deck parts also teach the wrong reading when they stand alone: 子 `zi` (should be zǐ), 卜 `bo` (should be bǔ; bo is only the neutral tone in 萝卜), and 只 `zhī` with the meaning "only", which belongs to zhǐ.

Erhua needed no grader change. Once 哪儿 is stored as "nǎr", `nar3` and `na3r` both match, because `split()` compares letters and tones separately.

### 2. The meaning answer key lacks the HSK 1 sense of core words

`translation` for single characters is makemeahanzi's definition. That definition often leads with, or only contains, a sense the HSK 1 learner is not learning. A learner who answers correctly is marked wrong, and the writing card shows the wrong sense as its prompt.

Of the 150 HSK 1 words, 53 have a problem that would mislead a learner or grade an answer wrongly (7 are clearly wrong). The deck parts add 55 more. Examples:

| Item           | Current translation                                  | Missing sense                              |
| -------------- | ---------------------------------------------------- | ------------------------------------------ |
| 里             | unit of distance equal to 0.5km; village; lane       | inside, in                                 |
| 和             | harmony, peace; calm, peaceful                       | and, with                                  |
| 会             | to assemble, to meet; meeting; association, group    | can, know how to, will                     |
| 热             | heat, fever, zeal                                    | hot                                        |
| 号             | mark, sign; symbol; number; to call, to cry, to roar | day of the month; "to roar" belongs to háo |
| 点             | dot, point, speck                                    | o'clock, a little                          |
| 去             | to go away, to leave, to depart                      | to go (to a place)                         |
| 叫             | cry, shout; to call, to greet, to hail               | to be called (named)                       |
| 干 (read gàn)  | arid, dry; to oppose; to offend; to invade           | every listed sense belongs to gān          |
| 占 (read zhàn) | to divine; to observe; to versify                    | every listed sense belongs to zhān         |

The RWC book's glosses are no fix: they are shorter still ("be big"). The HSK list's own glosses are CC-CEDICT senses and miss the point too (本 = "origin; source", with no "measure word for books").

Fix (applied): `src/server/database/seed/vocab-overrides.tsv`, loaded by both seeds and by `scripts/backfill-overrides.ts`, following the `vocab-classification.tsv` pattern.

### 3. Audio is served from `r2.dev`, which Cloudflare rate-limits and says not to use in production

Every `audio_url` points at `pub-…r2.dev`. Cloudflare's own limits page says the managed r2.dev domain is "not intended for production usage and has a variable rate limit applied to it", and it answers 429 when throttled ([R2 limits](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/r2/platform/limits.mdx)). The audit tripped it: 24 concurrent HEAD requests got 7,369 responses of 429. At 4 concurrent requests with backoff, all 9,638 objects answered 200, at 5.9 to 9.0 KB each.

Fix: bind a custom domain to the bucket. Then rewrite every stored `audio_url`, which is absolute, in one `UPDATE`, and set `S3_OPTIONS.cloudfrontDistributionUrl` so new audio uses the new domain. Check that `src/proxy.ts` puts the new host in `media-src`.

### 4. 53 glyphs the classification file disables are live in production

`vocab-classification.tsv` disables 53 glyphs, all of which have no gloss. In production `disabled` is false on all 9,641 rows. They show up in dictionary search, and 47 enabled characters list one of them as a decomposition part. One of those characters, 青, is in the deck: it shows 龶, whose `pinyin` is the glyph itself ("龶") and which has TTS audio of it.

No tool can apply the file today. `classify-vocab.ts` was deleted as "already run", but it never ran on production, and `backfill-classification.ts` deliberately never touches `disabled`. Disabling these 53 needs its own narrow script. None of them is in a deck in production, so no deck link has to be purged.

## Should fix before launch

### 5. Stray alternatives let wrong answers pass

Any one comma- or semicolon-separated alternative is a correct answer (`TranslationChecker.splitAlternatives`, Jaccard threshold 0.2).

- **Surnames.** 259 characters list "surname" as an alternative, so typing "surname" passes on 五, 王 and 马 in the deck. Keep it only where the surname is the main modern use (刘, 李).
- **Senses of another reading.** 都 "metropolis" (dū), 的 "aim, goal" (dì), 喝 "to shout" (hè), 乐 lè "music" (yuè).
- **Wrong modern senses.** 他 "she, it", 我 "our, us", 大 "high, deep", 坐 "seat" (座).

### 6. Writing prompts are ambiguous, and writing answers must match exactly

124 English meanings are shared by two or more writing-quizzable deck items. For example, "father" is 父, 爸 and 爸爸; "see" is 目, 看, 看见 and 见; "time" is 回, 时, 时候 and 期. The prompt is the whole translation, so a learner who types a correct 爸 for "father" is marked wrong when the card wanted 爸爸.

The data alone cannot fix this. Pick one:

- accept any item in the deck whose translation covers the prompt;
- show the character count or the pinyin on the prompt;
- or keep writing to HSK words only.

### 7. One reading per row cannot represent heteronyms

觉 is in the deck only for 睡觉, where it is read jiào. As a character, though, its main reading is jué. That makes both values wrong for one of its uses, and the same holds for 了, 长, 行, 得 and 乐.

Decide the rule: either a part's reading card is skipped when the deck word reads it differently, or rows get a list of accepted readings. The model review suggested changing 觉 to jiào; I overruled it for that reason.

### 8. About one dictionary character in six has a questionable definition or reading

Learners can build decks from any character, so this is quizzed data too. A cheap triage flagged 1,536 of the 9,130 characters outside the deck. A stronger model then judged a random sample of 60, and agreed that 55 were real problems. Examples:

- 蚝 "a poisonous hairy caterpillar": the modern meaning is oyster.
- 劉 "to kill, to destroy; surname": in modern use it is only the surname.
- 挨 āi "to wait": that sense belongs to ái.
- 蠢 leads with "to wriggle".

Triage the list by the characters learners actually reach (HSK 2–6, then the RWC 2,338) rather than working through all 1,536.

### 9. Some deck parts are missing from the deck

The deck description promises "the characters and components they're built from", but 18 part links are missing. They are the components classified after the deck was built: ⺊ in 上, 卓 and 占; ⺈ in 尔, 欠 and 厃; ⺍ in 觉, 兴 and 学; ⺼ in 能 and 脑. Others are 千 in 舌, 冋 in 高, 丄 in 工, 勿 in 豕, 兀 in 西, 龶 in 青 and ⺀ in 头.

Gating is not blocked, because the rule only counts parts inside the deck. But these parts are never taught. Re-run the deck seed's constituent step. Leave 龶 out, since finding 4 disables it.

## Cosmetic

- 111 translations contain non-breaking spaces (`\xa0`), and 3 have stray leading whitespace. The grader tolerates both.
- 乛 is glossed "kwukyel", a Korean term, and it is a meaning-only component in the deck, so that gloss is its whole quiz.
- 20 definitions are only "used in transliterations" or "used in onomatopoetic expressions", with nothing to quiz against.
- Six meaning-only components (⺌, ⺍, ⺼, ⺗, ⺳, and 龶, which is stored as a character) have their own glyph as `pinyin`, and TTS audio of it. That is inert for the components, but not for 龶 (finding 4).
- 霎 is in `dictionary.txt` but missing from production.

## Checked and clean

- Stroke data (strokes, medians, matches) and a decomposition exist for all 9,466 enabled characters, and their counts agree.
- Every audio URL resolves (9,638 objects, all 200).
- The 107 components and 8 phonetics match `vocab-classification.tsv` exactly. Every component has a gloss.
- `script` matches `script-classification.tsv` on every row. The deck has 263 `both` and 135 `simplified` items, and no traditional ones.
- All 150 HSK 1 words are in the deck. No word's characters are missing from it.
- The 682 memory aids were checked for fidelity when they were imported.

## Method and limits

- **Structural checks** are deterministic, run over every row. The grader behaviour in finding 1 was run through `pinyinMatches` itself.
- **Semantic checks** are model review, not a native-speaker pass.
  - The 398 deck rows got two independent model passes. They agreed on 105 of 108 flags, and I overruled one (觉, finding 7).
  - The dictionary triage's precision was estimated from a sample of 60.
  - Have a fluent reviewer confirm `data-audit/hsk1-deck.tsv` before any of it is applied.
- **Not audited:**
  - whether each TTS clip says the stored reading, which matters for heteronyms such as 了, 呢 and 只;
  - the etymology hints;
  - user-created content (there is none in production yet).
