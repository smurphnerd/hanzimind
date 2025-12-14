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
    : "/dashboard";

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
    <div className="flex min-h-screen flex-col items-center justify-center py-2">
      <Card className="w-[32rem] max-w-full">
        <CardContent className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Create an account</h1>
          <form
            onSubmit={(event) => {
              void form.handleSubmit((data) => {
                signUpMutation.mutate(data);
              })(event);
            }}
            className="flex flex-col gap-2"
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
            >
              Sign up
            </Button>
          </form>
          <div className="text-sm text-center">
            Already have an account?{" "}
            <Link href="/signin" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
