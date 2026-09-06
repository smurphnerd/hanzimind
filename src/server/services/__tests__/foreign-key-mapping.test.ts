import { describe, expect, it } from "vitest";

import { InvalidInputError, NotFoundError } from "@/server/endpoints/errors";
import { AdminService } from "../AdminService";
import { StudyService } from "../StudyService";
import { SuggestionService } from "../SuggestionService";
import { VocabService } from "../VocabService";

/**
 * What the pg driver hands Drizzle for a foreign key the caller invented, in the
 * shape Drizzle rethrows it. These pin the four inserts that take a
 * caller-supplied id: delete a guard and the site answers 500 again.
 */
const fkError = (constraint: string) =>
  new Error("insert or update violates foreign key constraint", {
    cause: { code: "23503", constraint },
  });

const rejectingChain = (error: Error, methods: string[]) => {
  const chain: Record<string, unknown> = {};
  for (const method of methods) {
    chain[method] = () =>
      method === methods.at(-1) ? Promise.reject(error) : chain;
  }
  return chain;
};

const logger = { error: () => {}, warn: () => {}, info: () => {} };

describe("a caller-supplied id that does not exist", () => {
  it("should be NOT_FOUND from vocab.createMemoryAid, not a server fault", async () => {
    const database = {
      insert: () =>
        rejectingChain(fkError("memory_aids_vocab_item_id_vocab_items_id_fk"), [
          "values",
          "returning",
        ]),
    };
    const service = new VocabService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof VocabService>[0]);

    await expect(
      service.createMemoryAid({
        vocabItemId: "no-such-item",
        userId: "user-1",
        memoryAid: "aid",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("should be NOT_FOUND from study.addSynonym", async () => {
    const database = {
      insert: () =>
        rejectingChain(
          fkError("user_vocab_synonyms_vocab_item_id_vocab_items_id_fk"),
          ["values", "onConflictDoNothing"],
        ),
    };
    const service = new StudyService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof StudyService>[0]);

    await expect(
      service.addSynonym({
        userId: "user-1",
        vocabItemId: "no-such-item",
        synonym: "hello",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("should be NOT_FOUND from study.addDeck", async () => {
    const tx = {
      insert: () =>
        rejectingChain(fkError("user_decks_deck_id_decks_id_fk"), [
          "values",
          "onConflictDoUpdate",
        ]),
    };
    const database = {
      transaction: (run: (tx: unknown) => Promise<unknown>) => run(tx),
    };
    const service = new StudyService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof StudyService>[0]);

    await expect(
      service.addDeck({
        userId: "user-1",
        deckId: "no-such-deck",
        readingEnabled: true,
        listeningEnabled: true,
        understandingEnabled: true,
        writingEnabled: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("should name the memory aid when that is the id suggestions.create got wrong", async () => {
    const database = {
      insert: () =>
        rejectingChain(fkError("suggestions_memory_aid_id_memory_aids_id_fk"), [
          "values",
          "returning",
        ]),
    };
    const service = new SuggestionService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof SuggestionService>[0]);

    await expect(
      service.create({
        userId: "user-1",
        kind: "memoryAid",
        body: "wrong",
        memoryAidId: "no-such-aid",
      }),
    ).rejects.toThrow("Memory aid not found");
  });

  it("should name the vocab item when that is the id suggestions.create got wrong", async () => {
    const database = {
      insert: () =>
        rejectingChain(fkError("suggestions_vocab_item_id_vocab_items_id_fk"), [
          "values",
          "returning",
        ]),
    };
    const service = new SuggestionService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof SuggestionService>[0]);

    await expect(
      service.create({
        userId: "user-1",
        kind: "translation",
        body: "wrong",
        vocabItemId: "no-such-item",
      }),
    ).rejects.toThrow("Vocab item not found");
  });
});

describe("AdminService.updateVocabItem", () => {
  it("should refuse a whitespace-only definition as bad input, not a server fault", async () => {
    const database = {
      query: {
        vocabItems: {
          findFirst: () =>
            Promise.resolve({
              id: "id-1",
              vocabItem: "亻",
              vocabType: "component",
            }),
        },
      },
    };
    const service = new AdminService({
      logger,
      database,
    } as unknown as ConstructorParameters<typeof AdminService>[0]);

    await expect(
      service.updateVocabItem({ id: "id-1", translation: "   " }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });
});
