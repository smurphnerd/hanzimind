import ForgotPasswordClientPage from "@/app/forgot-password/page.client";
import { env } from "@/env";

export default function ForgotPasswordPage() {
  return <ForgotPasswordClientPage baseUrl={env.BASE_URL} />;
}
