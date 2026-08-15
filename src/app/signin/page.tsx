import { Suspense } from "react";

import SignInClientPage from "@/app/signin/page.client";
import { env } from "@/env";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInClientPage baseUrl={env.BASE_URL} />
    </Suspense>
  );
}
