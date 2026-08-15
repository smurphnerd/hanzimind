"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4";

import { Mika } from "@/components/mika";
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
        const err = new Error(result.error.message ?? "Sign in failed");
        err.name = result.error.code ?? "UNKNOWN";
        throw err;
      }
    },
    onSuccess: () => {
      toast("Signed in successfully!");
      window.location.href = callbackURL;
    },
    onError: (error) => {
      if (
        error.name === "EMAIL_NOT_VERIFIED" ||
        /not verified/i.test(error.message)
      ) {
        toast.error(
          "Please verify your email address. Check your inbox for the verification link.",
        );
      } else {
        toast.error("Invalid email or password. Please try again.");
      }
    },
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8">
      <Card className="w-[32rem] max-w-full">
        <CardContent className="flex flex-col gap-4 py-8">
          <div className="flex flex-col items-center gap-2">
            <Mika pose="wave" size={56} />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
              Welcome Back
            </h1>
          </div>

          <form
            onSubmit={(event) => {
              void form.handleSubmit((data) => {
                signInMutation.mutate(data);
              })(event);
            }}
            className="flex flex-col gap-4"
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
              className="mt-2"
              size="lg"
            >
              Sign In
            </Button>
          </form>

          <div className="my-2 border-t border-border" />

          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-primary transition-colors hover:text-primary/80"
            >
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
