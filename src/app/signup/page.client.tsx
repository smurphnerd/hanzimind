"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { Mika } from "@/components/mika";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});
type SignUpFormSchema = z.infer<typeof SignUpFormSchema>;

export default function SignUpClientPage(props: { baseUrl: string }) {
  const redirectURL = useSearchParams().get("redirectUrl");
  const callbackURL = redirectURL
    ? `${props.baseUrl}/${redirectURL}` // prevent open redirect
    : "/verified";
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(SignUpFormSchema, {
      error: (iss) => {
        if (iss.path?.[0] === "email") {
          return "Please enter a valid email";
        }
        if (iss.path?.[0] === "password") {
          return iss.message ?? "Password must be at least 8 characters";
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
      toast.success("Account created! Check your email to verify it.");
    },
    onError: (error) => {
      if (error.message.includes("already exists")) {
        toast.error(
          "An account with this email already exists. Please sign in instead.",
        );
      } else {
        toast.error("Failed to create account. Please try again.");
      }
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
            <p className="text-sm text-muted-foreground">
              We sent a verification link to{" "}
              <span className="font-semibold text-foreground">{sentTo}</span>.
              Click it to activate your account.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
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

          <form
            onSubmit={(event) => {
              void form.handleSubmit((data) => {
                signUpMutation.mutate(data);
              })(event);
            }}
            className="flex flex-col gap-4"
          >
            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    {...field}
                    id="username"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="johndoe"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="john@example.com"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
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

          <div className="my-2 border-t border-border" />

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
