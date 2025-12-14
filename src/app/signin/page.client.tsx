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

const SignInFormSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type SigninFormSchema = z.infer<typeof SignInFormSchema>;

export default function SignInClientPage(props: { baseUrl: string }) {
  const redirectURL = useSearchParams().get("redirectUrl");
  const callbackURL = redirectURL
    ? `${props.baseUrl}/${redirectURL}` // prevent open redirect
    : "/";

  const form = useForm({
    resolver: zodResolver(SignInFormSchema, {
      error: (iss) => {
        if (iss.path?.[0] === "email") {
          return "Please enter a valid email";
        }
        if (iss.path?.[0] === "password") {
          return "Password must be at least 8 characters";
        }
        return iss.code;
      },
    }),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signInMutation = useMutation({
    mutationFn: async (data: SigninFormSchema) => {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: () => {
      toast("Signed in successfully!");
      window.location.href = callbackURL;
    },
    onError: (error) => {
      if (error.message.includes("verify")) {
        toast.error(
          "Please verify your email address. Check your inbox for the verification link.",
        );
      } else {
        toast.error("Invalid email or password. Please try again.");
      }
    },
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-2">
      <Card className="w-[32rem] max-w-full">
        <CardContent className="flex flex-col gap-2">
          <form
            onSubmit={(event) => {
              void form.handleSubmit((data) => {
                signInMutation.mutate(data);
              })(event);
            }}
            className="flex flex-col gap-2"
          >
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
              isPending={signInMutation.isPending}
              disabled={signInMutation.isSuccess}
            >
              Sign in
            </Button>
          </form>
          <div className="text-sm text-center">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

