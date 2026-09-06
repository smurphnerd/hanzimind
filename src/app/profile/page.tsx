import ProfileClientPage from "@/app/profile/page.client";
import { env } from "@/env";

export default function ProfilePage() {
  return <ProfileClientPage baseUrl={env.BASE_URL} />;
}
