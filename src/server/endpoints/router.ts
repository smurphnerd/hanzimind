import { authMiddleware, commonProcedure } from "@/server/endpoints/procedure";
import { decksRouter } from "@/server/endpoints/decksRouter";
import { vocabRouter } from "@/server/endpoints/vocabRouter";
import { studyRouter } from "@/server/endpoints/studyRouter";

export const appRouter = {
  ping: commonProcedure.handler(() => "pong"),
  getProfile: commonProcedure
    .use(authMiddleware)
    .handler(({ context }) => ({ email: context.user.email })),
  decks: decksRouter,
  vocab: vocabRouter,
  study: studyRouter,
};
