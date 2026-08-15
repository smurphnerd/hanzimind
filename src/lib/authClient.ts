import "client-only";

import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

// adminClient mirrors the server's admin plugin so `useSession().data.user.role`
// is typed and the admin action methods are available on the client.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
