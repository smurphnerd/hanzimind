"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ProfilePage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      toast.success("Signed out. See you soon!");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/15 font-display text-xl font-extrabold text-accent uppercase">
              {isPending ? (
                <User className="size-7" />
              ) : (
                (session?.user?.name ?? session?.user?.email ?? "?")
                  .charAt(0)
                  .toUpperCase()
              )}
            </div>
            <div>
              <CardTitle className="text-2xl">
                {isPending
                  ? "Your profile"
                  : (session?.user?.name ?? "Your profile")}
              </CardTitle>
              <CardDescription>
                {session?.user?.email ?? "Manage your account and progress"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Detailed progress and settings are coming soon.
          </p>

          {!isPending &&
            (session?.user ? (
              <Button
                variant="outline"
                onClick={() => void handleSignOut()}
                isPending={signingOut}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            ) : (
              <Button asChild>
                <Link href="/signin">Sign in</Link>
              </Button>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
