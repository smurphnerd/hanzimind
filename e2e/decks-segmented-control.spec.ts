import { expect, test, type Locator } from "@playwright/test";

const DECK_ID = "deck-hsk1";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * The chosen segment of a segmented control must LOOK chosen.
 *
 * This exists because it silently stopped being true. `SegmentHint` wraps each
 * segment in `<TooltipTrigger asChild>`, which forwards the trigger's own
 * `data-state="closed"` into the child; Radix's Toggle and Tabs both write their
 * `data-state` and then spread `{...props}`, so the tooltip's value lands last
 * and every `data-[state=…]` rule stops matching. Nothing threw, no test failed,
 * and all seven depth segments shipped rendering identically to each other.
 *
 * Computed background rather than a class name or an attribute on purpose: a
 * class list can be full of rules that match nothing, which is exactly the bug.
 * The only claim that cannot be satisfied by dead CSS is that the pixels differ.
 */
test("the chosen segment is painted differently from an unchosen one", async ({
  page,
}) => {
  await page.goto(`/decks/${DECK_ID}`);

  const deckView = page.getByRole("tablist", { name: "Deck view" });
  await expect(deckView).toBeVisible();

  // The tab set. No option here carries a hint today, so it is not currently
  // wrapped in a tooltip — this guards against the day one gains a hint and
  // takes the same clobber the depth control took.
  await expectChosenSegmentIsPainted(
    deckView.getByRole("tab", { selected: true }),
    deckView.getByRole("tab", { selected: false }).first(),
  );

  await deckView.getByRole("tab", { name: "Graph" }).click();

  // The toggle group, which is where it actually broke: every depth option has
  // a hint, so every segment is a tooltip trigger.
  const depth = page.getByRole("group", { name: "Levels deep" });
  await expect(depth).toBeVisible();
  await expectChosenSegmentIsPainted(
    depth.getByRole("radio", { checked: true }),
    depth.getByRole("radio", { checked: false }).first(),
  );
});

async function expectChosenSegmentIsPainted(
  chosen: Locator,
  unchosen: Locator,
) {
  await expect(chosen).toHaveCount(1);
  await expect(unchosen).toBeVisible();

  const backgroundOf = (locator: Locator) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);

  const chosenBackground = await backgroundOf(chosen);
  const unchosenBackground = await backgroundOf(unchosen);

  expect(chosenBackground).not.toBe(unchosenBackground);
  expect(chosenBackground).not.toBe(TRANSPARENT);
}
