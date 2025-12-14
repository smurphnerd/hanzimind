import "server-only";

import { inArray, desc, count } from "drizzle-orm";
import type { Logger } from "pino";
import { err, ok, type Result } from "neverthrow";

import type { Drizzle } from "@/server/database/database";
import { schema } from "@/server/database/schema";
import type { S3StorageAdapter } from "@/server/services/S3StorageAdapter";
import type { TranslatorService } from "@/server/services/TranslatorService";
import type { TTSService } from "@/server/services/TTSService";
import { VocabTypeEnum, type VocabType } from "@/lib/enums";

export class VocabService {
  constructor(
    private deps: {
      logger: Logger;
      database: Drizzle;
      translator: TranslatorService;
      tts: TTSService;
      storage: S3StorageAdapter;
    },
  ) {}

  async getExistingVocabItems(vocabList: string[]): Promise<string[]> {
    if (vocabList.length === 0) {
      return [];
    }

    const results = await this.deps.database
      .select({ vocabItem: schema.vocabItems.vocabItem })
      .from(schema.vocabItems)
      .where(inArray(schema.vocabItems.vocabItem, vocabList));

    return results.map((r) => r.vocabItem);
  }

  async addVocabItem(vocabItem: string): Promise<Result<void, Error>> {
    try {
      // Check if it already exists
      const existing = await this.getExistingVocabItems([vocabItem]);
      if (existing.length > 0) {
        return ok(undefined);
      }

      // Check if it's a sentence by cutting it
      const parts = this.deps.translator.cutSentence(vocabItem);

      let componentsToAdd: string[];
      let translation: string;
      let vocabType: VocabType;

      // Is a sentence (multiple parts)
      if (parts.length > 1) {
        translation = await this.deps.translator.translateSentence(vocabItem);
        componentsToAdd = parts;
        vocabType = VocabTypeEnum.enum.sentence;
      } else if (vocabItem.length > 1) {
        // Is a compound word
        translation = await this.deps.translator.translateSentence(vocabItem);
        componentsToAdd = vocabItem.split("");
        vocabType = VocabTypeEnum.enum.compound;
      } else {
        // Is a single character should be in the dictionary
        return err(
          new Error(
            `Cannot add vocab item with single character: ${vocabItem}`,
          ),
        );
      }

      let pinyinParts: string[] = [];
      for (const part of parts) {
        pinyinParts.push(this.deps.translator.getPinyin(part));
      }
      const pinyin = pinyinParts.join(" ");

      if (!pinyin) {
        return err(new Error(`No pinyin found for vocab item: ${vocabItem}`));
      }

      // Generate audio and get URL
      const audioUrl = await this.deps.tts.getVocabAudio(vocabItem);

      // Recursively create components
      for (const component of componentsToAdd) {
        const result = await this.addVocabItem(component);
        if (result.isErr()) {
          return err(result.error);
        }
      }

      console.log(
        "adding",
        vocabItem,
        translation,
        pinyin,
        vocabType,
        audioUrl,
      );

      // Create the vocab item
      await this.deps.database
        .insert(schema.vocabItems)
        .values({
          vocabItem,
          translation,
          pinyin,
          vocabType,
          audioUrl,
        })
        .returning({ id: schema.vocabItems.id });

      return ok(undefined);
    } catch (error) {
      this.deps.logger.error(
        { error, vocabItem },
        "Error adding vocab item with components",
      );
      return err(
        error instanceof Error
          ? error
          : new Error("Failed to add vocab item with components"),
      );
    }
  }

  async listVocabItems(args: { page: number; pageSize: number }): Promise<{
    items: Array<{
      id: string;
      vocabItem: string;
      translation: string;
      pinyin: string;
      vocabType: VocabType;
      audioUrl: string;
      decomposition: string | null;
      etymologyHint: string | null;
      etymologyType: string | null;
      radical: string | null;
      strokes: unknown;
      strokeMedians: unknown;
      strokeMatches: unknown;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    console.log(args);
    const offset = (args.page - 1) * args.pageSize;

    const [items, totalResult] = await Promise.all([
      this.deps.database
        .select()
        .from(schema.vocabItems)
        .orderBy(desc(schema.vocabItems.createdAt))
        .limit(args.pageSize)
        .offset(offset),
      this.deps.database
        .select({ count: count() })
        .from(schema.vocabItems)
        .then((result) => result[0]?.count ?? 0),
    ]);

    const total = Number(totalResult);
    const totalPages = Math.ceil(total / args.pageSize);

    console.log({ items, total, page: args.page, pageSize: args.pageSize });

    return {
      items,
      total,
      page: args.page,
      pageSize: args.pageSize,
      totalPages,
    };
  }
}
