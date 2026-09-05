"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { Mika } from "@/components/mika";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/authClient";
import { z } from "@/lib/zod-jitless";

const SignUpFormSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, hyphens, and underscores",
    ),
  email: z.email(),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be at most 128 characters"),
});
type SignUpFormSchema = z.infer<typeof SignUpFormSchema>;

export default function SignUpClientPage(props: { baseUrl: string }) {
  const redirectURL = useSearchParams().get("redirectUrl");
  const callbackURL = redirectURL
    ? `${props.baseUrl}/${redirectURL}` // prevent open redirect
    : "/verified";
  const [sentTo, setSentTo] = useState<string | null>(null);

  // The sign-up endpoint answers 200 even when the send fails, so the learner
  // cannot be told at that moment. This is the way back: ask for another one,
  // and this call does report a failure.
  const resend = useMutation({
    mutationFn: async (email: string) => {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not send the email");
      }
    },
    onSuccess: () => toast.success("Sent. Check your inbox again."),
    onError: () =>
      toast.error("Couldn't send it. Please try again in a minute."),
  });

  const form = useForm({
    resolver: zodResolver(SignUpFormSchema, {
      error: (iss) => {
        if (iss.path?.[0] === "email") {
          return "Please enter a valid email";
        }
        if (iss.path?.[0] === "password") {
          return iss.message ?? "Password must be at least 10 characters";
        }
        if (iss.path?.[0] === "username") {
          return iss.message ?? "Username must be at least 3 characters";
        }
        return iss.code;
      },
    }),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async (data: SignUpFormSchema) => {
      const result = await authClient.signUp.email({
        name: data.username,
        email: data.email,
        password: data.password,
        callbackURL,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: (_data, variables) => {
      setSentTo(variables.email);
      form.reset();
      toast.success("Check your email to finish signing up.");
    },
    onError: () => {
      toast.error("Failed to create account. Please try again.");
    },
  });

  if (sentTo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <Card className="w-[32rem] max-w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Mika pose="cheer" size={80} />
            <div className="flex items-center gap-2 text-accent">
              <MailCheck className="size-5" />
              <span className="font-display text-sm font-bold tracking-wide uppercase">
                Check your email
              </span>
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
              Almost there!
            </h1>
            {/* Sign-up answers the same way whether or not the address is
                taken — same body, same headers, same duration — so this screen
                cannot say which happened, and must not try. What it can now
                say is that an email went out either way: a verification link
                for a new address or one that never finished signing up, and a
                note with a way back in for one that already has an account.
                See `onExistingUserSignUp` in `src/server/auth.tsx`. */}
            <p className="text-sm text-muted-foreground">
              An email is on its way to{" "}
              <span className="font-semibold text-foreground">{sentTo}</span>.
              If it&apos;s new here, that email has the link that activates your
              account. If it already has one, the email has your way back into
              it.
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing after a minute? Send it again — or{" "}
              <Link
                href="/forgot-password"
                className="font-medium text-primary transition-colors hover:text-primary/80"
              >
                reset your password
              </Link>{" "}
              if the account is already yours.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                isPending={resend.isPending}
                onClick={() => resend.mutate(sentTo)}
              >
                Resend email
              </Button>
              <Button variant="outline" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
              <Button asChild>
                <Link href="/signin">Go to sign in</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8">
      <Card className="w-[32rem] max-w-full">
        <CardContent className="flex flex-col gap-4 py-8">
          <div className="flex justify-center">
            <Mika pose="wave" size={56} />
          </div>

          <h1 className="mb-1 text-center font-display text-2xl font-extrabold tracking-tight text-foreground">
            Create Account
          </h1>
          <p className="mb-2 text-center text-sm text-muted-foreground">
            Begin your Chinese learning journey
          </p>

          <Form {...form}>
            <form
              onSubmit={(event) => {
                void form.handleSubmit((data) => {
                  signUpMutation.mutate(data);
                })(event);
              }}
              className="flex flex-col gap-4"
            >
              <FormField
                name="username"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" placeholder="johndoe" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="email"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="john@example.com"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="password"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                isPending={signUpMutation.isPending}
                className="mt-2"
                size="lg"
              >
                Create Account
              </Button>
            </form>
          </Form>

          <Separator className="my-2" />

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="font-medium text-primary transition-colors hover:text-primary/80"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
