import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy · HanziMind",
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Privacy</CardTitle>
          <CardDescription>
            How HanziMind handles your data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            A full privacy policy is on the way. In short: your study data is
            used only to power your learning experience.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
