/**
 * Local preview seed: inserts a focused subset of common vocabulary (with audio)
 * so the app is usable immediately, instead of the full ~9.5k-entry dictionary.
 *
 * Run with:  ./node_modules/.bin/tsx --env-file=.env scripts/seed-preview.ts
 */
import fs, { readFileSync } from "node:fs";
import { join } from "node:path";
import { pino } from "pino";

import { getDatabase } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import { TranslatorService } from "@/server/services/TranslatorService";
import { TTSService } from "@/server/services/TTSService";
import { GoogleTTSAPIProvider } from "@/server/services/tts/GoogleTTSAPIProvider";
import { envSchema } from "@/env-utils";
import type { EtymologyType } from "@/definitions/definitions";

// Common HSK1-level characters worth studying.
const CHARACTERS = [
  "人", "大", "小", "上", "下", "中", "口", "日", "月", "水",
  "火", "山", "女", "子", "好", "我", "你", "他", "她", "们",
  "不", "是", "有", "在", "会", "说", "看", "听", "吃", "喝",
  "来", "去", "买", "学", "写", "读", "家", "国", "天", "年",
  "今", "明", "多", "少", "很", "太", "白", "黑", "红", "马",
  "妈", "字", "安", "吗", "林", "明", "河", "什", "么", "书",
];

// Multi-character words built from the characters above.
const COMPOUNDS: { word: string; translation: string }[] = [
  { word: "你好", translation: "hello" },
  { word: "我们", translation: "we; us" },
  { word: "他们", translation: "they; them" },
  { word: "妈妈", translation: "mom" },
  { word: "名字", translation: "name" },
  { word: "中国", translation: "China" },
  { word: "今天", translation: "today" },
  { word: "明天", translation: "tomorrow" },
  { word: "学生", translation: "student" },
  { word: "老师", translation: "teacher" },
];

interface DictionaryEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
  decomposition?: string;
  etymology?: { type: string; hint: string };
  radical?: string;
  matches?: (number[] | null)[];
}
interface GraphicsEntry {
  character: string;
  strokes?: string[];
  medians?: number[][][];
}

async function main() {
  const env = envSchema.parse({ ...process.env, NODE_ENV: process.env.NODE_ENV });
  const logger = pino({ level: "warn" });
  const database = getDatabase(logger, env.DATABASE_URL);
  const storage = new S3StorageAdapter(env.S3_OPTIONS);
  const translator = new TranslatorService({ logger }, { deeplApiKey: env.DEEPL_API_KEY });
  const tts = new TTSService(
    { logger, storage, ttsProvider: new GoogleTTSAPIProvider(logger) },
    {
      publicUrl:
        env.S3_OPTIONS.cloudfrontDistributionUrl ??
        `${env.S3_OPTIONS.endpoint}/${env.S3_OPTIONS.bucketName}`,
    },
  );

  const seedDir = join(process.cwd(), "src/server/database/seed");
  const dict = new Map<string, DictionaryEntry>();
  for (const line of readFileSync(join(seedDir, "dictionary.txt"), "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as DictionaryEntry;
      if (!dict.has(e.character)) dict.set(e.character, e);
    } catch {}
  }
  const gfx = new Map<string, GraphicsEntry>();
  for (const line of readFileSync(join(seedDir, "graphics.txt"), "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as GraphicsEntry;
      gfx.set(e.character, e);
    } catch {}
  }

  // Expand each character into its decomposition components, recursively.
  // The full dictionary seed would already contain these; because this preview
  // seed is a subset, they have to be pulled in explicitly — otherwise a
  // character like 读 (⿰讠卖) has no components in the DB, so it can't be
  // gated on them and appears immediately.
  const isIdc = (c: string) => {
    const cp = c.codePointAt(0) ?? 0;
    return cp >= 0x2ff0 && cp <= 0x2fff;
  };
  const componentsOf = (char: string) =>
    Array.from(dict.get(char)?.decomposition ?? "").filter(
      (c) => c !== char && c !== "？" && c !== "?" && !isIdc(c),
    );

  // Radicals are the atomic level: they're taught as-is and never broken down
  // further. Anything that is NOT a radical keeps decomposing until it bottoms
  // out in radicals. The radical set is derived from the dataset itself (the
  // `radical` field of every entry) rather than hard-coded.
  const radicals = new Set<string>();
  for (const entry of dict.values()) {
    if (entry.radical) radicals.add(entry.radical);
  }

  const base = new Set(CHARACTERS);
  const all = new Set(base);
  const queue = [...base].filter((c) => !radicals.has(c));

  while (queue.length > 0) {
    const char = queue.shift() as string;
    for (const part of componentsOf(char)) {
      if (all.has(part)) continue;
      all.add(part);
      if (!radicals.has(part)) queue.push(part);
    }
  }

  // Drop components with no definition (purely graphical radicals like ⺊ ⺈ ⺍).
  // They have no meaning to quiz and pinyin-pro hands the glyph back unchanged,
  // so they'd only ever produce unanswerable cards.
  const isTeachable = (char: string) => {
    if (base.has(char)) return true;
    const entry = dict.get(char);
    return !!entry?.definition && !!entry?.pinyin?.length;
  };
  for (const char of [...all]) {
    if (!isTeachable(char)) all.delete(char);
  }

  const constituentOnly = new Set([...all].filter((c) => !base.has(c)));
  const wanted = Array.from(all);
  console.log(
    `Seeding ${wanted.length} characters (${base.size} base + ${constituentOnly.size} components) + ${COMPOUNDS.length} words...`,
  );

  let done = 0;
  for (const char of wanted) {
    const existing = await database.query.vocabItems.findFirst({
      where: (v, { eq }) => eq(v.vocabItem, char),
    });
    if (existing) { done++; continue; }

    const entry = dict.get(char);
    const graphics = gfx.get(char);
    const pinyin = entry?.pinyin?.[0] ?? translator.getPinyin(char);

    let audioUrl = "";
    try {
      audioUrl = await tts.getVocabAudio(char);
    } catch (e) {
      console.warn(`  audio failed for ${char}`);
    }

    await database.insert(schema.vocabItems).values({
      vocabItem: char,
      translation: entry?.definition ?? null,
      pinyin,
      vocabType: "character",
      audioUrl,
      decomposition: entry?.decomposition ?? null,
      etymologyHint: entry?.etymology?.hint ?? null,
      etymologyType: (entry?.etymology?.type as EtymologyType) ?? null,
      radical: entry?.radical ?? null,
      strokes: graphics?.strokes ?? null,
      strokeMedians: (graphics?.medians as [number, number][][]) ?? null,
      strokeMatches: entry?.matches ?? null,
    });
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${wanted.length} characters`);
  }

  for (const { word, translation } of COMPOUNDS) {
    const existing = await database.query.vocabItems.findFirst({
      where: (v, { eq }) => eq(v.vocabItem, word),
    });
    if (existing) continue;

    let audioUrl = "";
    try {
      audioUrl = await tts.getVocabAudio(word);
    } catch {
      console.warn(`  audio failed for ${word}`);
    }

    await database.insert(schema.vocabItems).values({
      vocabItem: word,
      translation,
      pinyin: translator.getPinyin(word),
      vocabType: "compound",
      audioUrl,
      decomposition: null,
      etymologyHint: null,
      etymologyType: null,
      radical: null,
      strokes: null,
      strokeMedians: null,
      strokeMatches: null,
    });
  }

  fs.writeFileSync("/tmp/seed-membership.json", JSON.stringify({ base: [...base], constituents: [...constituentOnly], compounds: COMPOUNDS.map((c) => c.word) }));
  const total = await database.select().from(schema.vocabItems);
  console.log(`Done. vocab_items rows: ${total.length}`);
  process.exit(0);
}

await main();
