import { env } from "@/env";
import { isAdminEmail, parseAdminEmails } from "@/server/admin-access";
import { authMiddleware, commonProcedure } from "@/server/endpoints/procedure";
import { adminRouter } from "@/server/endpoints/adminRouter";
import { decksRouter } from "@/server/endpoints/decksRouter";
import { vocabRouter } from "@/server/endpoints/vocabRouter";
import { studyRouter } from "@/server/endpoints/studyRouter";

export const appRouter = {
  ping: commonProcedure.handler(() => "pong"),
  getProfile: commonProcedure.use(authMiddleware).handler(({ context }) => ({
    email: context.user.email,
    // ADMIN_EMAILS is server-only, so the client learns its own admin status
    // here rather than by comparing addresses itself. This only ever reveals
    // whether *you* are an admin — the list itself never leaves the server, and
    // every admin endpoint re-checks regardless of what the client believes.
    isAdmin: isAdminEmail(
      context.user.email,
      parseAdminEmails(env.ADMIN_EMAILS),
    ),
  })),
  admin: adminRouter,
  decks: decksRouter,
  vocab: vocabRouter,
  study: studyRouter,
};
