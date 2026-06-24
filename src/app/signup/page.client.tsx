"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/authClient";

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
    : "/";

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
    onSuccess: () => {
      toast.success(
        "Account created! Please check your email to verify your account.",
      );
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

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center py-8">
      <Card className="relative w-[32rem] max-w-full overflow-hidden ornament-corners">
        {/* Decorative red header strip */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-primary via-vermillion to-primary" />
        <div className="absolute inset-x-0 top-16 h-1 bg-gold" />

        <CardContent className="flex flex-col gap-4 pt-24 pb-8">
          {/* Decorative logo element */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="h-14 w-14 rounded-full border-3 border-gold bg-rice-paper flex items-center justify-center shadow-lg">
              <span className="font-brush text-2xl text-primary">新</span>
            </div>
          </div>

          <h1 className="text-center mb-2">
            <span className="font-brush text-2xl text-primary">Create Account</span>
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-2">
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
              disabled={signUpMutation.isSuccess}
              className="mt-2"
              size="lg"
            >
              Create Account
            </Button>
          </form>

          <div className="divider-ornamental my-2">
            <span className="medallion text-xs">或</span>
          </div>

          <div className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link href="/signin" className="text-primary font-medium hover:text-vermillion transition-colors">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
