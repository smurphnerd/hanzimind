import { authMiddleware, commonProcedure } from "@/server/endpoints/procedure";
import { decksRouter } from "@/server/endpoints/decksRouter";
import { vocabRouter } from "@/server/endpoints/vocabRouter";

export const appRouter = {
  ping: commonProcedure.handler(() => "pong"),
  getProfile: commonProcedure
    .use(authMiddleware)
    .handler(({ context }) => ({ email: context.user.email })),
  decks: decksRouter,
  vocab: vocabRouter,
};
