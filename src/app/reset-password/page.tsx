import { Suspense } from "react";

import ResetPasswordClientPage from "@/app/reset-password/page.client";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordClientPage />
    </Suspense>
  );
}
