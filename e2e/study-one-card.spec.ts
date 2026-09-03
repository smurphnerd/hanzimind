import { expect, test } from "@playwright/test";

import { rpc } from "./fixtures";

const DECK_ID = "deck-hsk1";
const STAGE = /Not started|Seedling|Sprout|Sapling|Blooming|Evergreen/;

type NextCard = {
  vocabItem: string;
  studyType: "new" | "reading" | "listening" | "understanding" | "writing";
  pinyin?: string;
  translation?: string | null;
} | null;

test("answering one card in HSK 1 shows the result card with a level", async ({
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
  const next = await rpc<NextCard>(request, "study/nextVocabItem", {
    deckId: DECK_ID,
  });
  expect(next, "the deck has nothing due").not.toBeNull();
  const item =
    next!.studyType === "new"
      ? next!
      : await rpc<NonNullable<NextCard>>(request, "vocab/get", {
          vocabItem: next!.vocabItem,
        });

  await page.goto(`/study/${DECK_ID}`);
  const intro = page.getByRole("heading", { name: "New word" });
  const input = page.getByRole("textbox");
  await expect(intro.or(input).first()).toBeVisible();
  if (await intro.isVisible()) {
    await page.getByRole("button", { name: "Continue" }).click();
  }

  await expect(input).toBeVisible();
  const placeholder = (await input.getAttribute("placeholder")) ?? "";
  const answer = placeholder.startsWith("Pinyin")
    ? (item.pinyin ?? "")
    : placeholder.startsWith("Type the characters")
      ? item.vocabItem
      : (item.translation ?? "").split(/[,;]/)[0].trim();
  await input.fill(answer);
  await input.press("Enter");

  await expect(page.getByText(/对! Nailed it|Not quite/)).toBeVisible();
  await expect(page.getByText(STAGE).first()).toBeVisible();
});
