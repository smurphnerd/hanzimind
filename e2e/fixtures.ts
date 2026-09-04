import { expect, type APIRequestContext } from "@playwright/test";

export const LEARNER = {
  email: "verify@hanzimind.test",
  password: "verify-hanzimind",
};

export const SEED_HINT =
  "The seeded learner verify@hanzimind.test is missing. Seed the lane with SEED_TEST_USER=1 (lane-up.sh does).";

export const RATE_LIMIT_HINT =
  "The auth layer allows three sign-ins per ten seconds per address. Wait ten seconds and rerun.";

export async function explainSignInFailure(request: APIRequestContext) {
  const response = await request.post("/api/auth/sign-in/email", {
    data: LEARNER,
  });
  if (response.status() === 429) return RATE_LIMIT_HINT;
  if (response.status() === 401) return SEED_HINT;
  return `Sign-in answered ${response.status()}: ${await response.text()}`;
}

export async function rpc<T = unknown>(
  request: APIRequestContext,
  path: string,
  input: unknown,
  options: { timeout?: number } = {},
): Promise<T> {
  const response = await request.post(`/api/rpc/${path}`, {
    data: { json: input },
    timeout: options.timeout,
  });
  expect(response.ok(), `${path} answered ${response.status()}`).toBe(true);
  const body = (await response.json()) as { json: T };
  return body.json;
}

export async function currentUserId(request: APIRequestContext) {
  const response = await request.get("/api/auth/get-session");
  const session = (await response.json()) as { user: { id: string } } | null;
  expect(session, "no session on this request context").not.toBeNull();
  return session!.user.id;
}

// Grading an understanding answer loads the semantic similarity model on first
// use, five seconds on a fresh dev server and a 90 MB download when lane-up.sh
// has not prefetched it. One throwaway answer loads it before any spec waits on
// a result card. The item is read out of the deck rather than named here: the
// server rejects an answer for an item the deck does not hold.
export async function warmUpGrading(request: APIRequestContext) {
  const userId = await currentUserId(request);
  await rpc(request, "study/addDeck", {
    deckId: "deck-hsk1",
    readingEnabled: true,
    listeningEnabled: true,
    understandingEnabled: true,
    writingEnabled: true,
  });
  const deck = await rpc<{ vocabItems: { id: string }[] }>(
    request,
    "decks/getById",
    { deckId: "deck-hsk1" },
  );
  const item = deck.vocabItems[0];
  expect(item, "deck-hsk1 has no items to warm up with").toBeTruthy();
  await rpc(
    request,
    "study/submitAnswer",
    {
      deckId: "deck-hsk1",
      answer: {
        vocabItemId: item!.id,
        userId,
        deckId: "deck-hsk1",
        studyType: "understanding",
        answer: "warm-up",
      },
    },
    { timeout: 120_000 },
  );
}
