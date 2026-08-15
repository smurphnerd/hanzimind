import { commonProcedure } from "@/server/endpoints/procedure";
import { adminRouter } from "@/server/endpoints/adminRouter";
import { decksRouter } from "@/server/endpoints/decksRouter";
import { suggestionsRouter } from "@/server/endpoints/suggestionsRouter";
import { vocabRouter } from "@/server/endpoints/vocabRouter";
import { studyRouter } from "@/server/endpoints/studyRouter";

export const appRouter = {
  ping: commonProcedure.handler(() => "pong"),
  // Admin status now travels on the session as `user.role` (Better Auth admin
  // plugin), so the client reads it from useSession() rather than a getProfile
  // round trip. Every admin endpoint still re-checks the role server-side.
  admin: adminRouter,
  decks: decksRouter,
  vocab: vocabRouter,
  study: studyRouter,
  suggestions: suggestionsRouter,
};
