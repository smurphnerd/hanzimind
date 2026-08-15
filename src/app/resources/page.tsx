import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Resources · HanziMind",
};

export default function ResourcesPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Resources</CardTitle>
          <CardDescription>
            Guides and learning resources for studying Chinese with HanziMind.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            We&apos;re putting together study guides, tips on stroke order, and
            more. Check back soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
