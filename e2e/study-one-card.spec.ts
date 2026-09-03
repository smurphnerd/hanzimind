import { expect, test } from "@playwright/test";

import { rpc } from "./fixtures";

const DECK_ID = "deck-hsk1";
const STAGE = /Not started|Seedling|Sprout|Sapling|Blooming|Evergreen/;

type Card = {
  id: string;
  studyType: "new" | "reading" | "listening" | "understanding" | "writing";
} | null;

type Entry = { vocabItem: string; pinyin: string; translation: string | null };

type Deck = { vocabItems: { id: string; vocabItem: string }[] };

test("answering one card in HSK 1 correctly shows the result card with a level", async ({
  page,
  request,
}) => {
  await rpc(request, "study/addDeck", {
    deckId: DECK_ID,
    readingEnabled: true,
    listeningEnabled: true,
    understandingEnabled: true,
    writingEnabled: true,
  });
  const first = await rpc<Card>(request, "study/nextVocabItem", {
    deckId: DECK_ID,
  });
  expect(first, "the deck has nothing due").not.toBeNull();

  const nextCard = () =>
    page
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/rpc/study/nextVocabItem") &&
          response.ok(),
      )
      .then(
        async (response) =>
          ((await response.json()) as { json: Card | null }).json,
      );

  let cardPromise = nextCard();
  await page.goto(`/study/${DECK_ID}`);
  let card = await cardPromise;
  if (card?.studyType === "new") {
    await expect(page.getByRole("heading", { name: "New word" })).toBeVisible();
    cardPromise = nextCard();
    await page.getByRole("button", { name: "Continue" }).click();
    card = await cardPromise;
  }
  const input = page.getByRole("textbox");
  await expect(input).toBeVisible();

  // A listening or writing card hides its glyph, so the deck's item list maps
  // the card's id back to it.
  expect(card, "no quiz card followed the intro").not.toBeNull();
  const deck = await rpc<Deck>(request, "decks/getById", { deckId: DECK_ID });
  const glyph = deck.vocabItems.find((item) => item.id === card!.id)?.vocabItem;
  expect(glyph, `card ${card!.id} is not in the deck`).toBeTruthy();
  const entry = await rpc<Entry>(request, "vocab/get", { vocabItem: glyph });
  const answer = {
    reading: entry.pinyin,
    listening: entry.pinyin,
    understanding: entry.translation ?? "",
    writing: entry.vocabItem,
    new: "",
  }[card!.studyType];
  expect(answer, `${glyph} ${card!.studyType}`).not.toBe("");

  await input.fill(answer);
  await input.press("Enter");

  await expect(page.getByText("对! Nailed it")).toBeVisible();
  await expect(page.getByText(STAGE).first()).toBeVisible();
});
