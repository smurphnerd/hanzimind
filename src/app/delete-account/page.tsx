import { Suspense } from "react";

import DeleteAccountClientPage from "@/app/delete-account/page.client";

export default function DeleteAccountPage() {
  return (
    <Suspense>
      <DeleteAccountClientPage />
    </Suspense>
  );
}
