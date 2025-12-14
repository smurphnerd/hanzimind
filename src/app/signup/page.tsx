import { Suspense } from "react";

import SignUpClientPage from "./page.client";
import { env } from "@/env";

export default async function SignUpPage() {
  return (
    <Suspense>
      <SignUpClientPage baseUrl={env.BASE_URL} />
    </Suspense>
  );
}
