"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { safeCallbackUrl } from "@/lib/nav";
import { z } from "@/lib/zod-jitless";

const SignInFormSchema = z.object({
  email: z.email(),
  // No minimum here. A minimum belongs on sign-up and on reset; on sign-in it
  // would lock out every account created under an older rule, with the form
  // refusing to submit and the server never getting to say why.
  password: z.string().min(1, "Enter your password"),
});
type SigninFormSchema = z.infer<typeof SignInFormSchema>;

export default function SignInClientPage(props: { baseUrl: string }) {
  const redirectURL = useSearchParams().get("redirectUrl");
  const callbackURL = safeCallbackUrl(props.baseUrl, redirectURL);

  const form = useForm({
    resolver: zodResolver(SignInFormSchema, {
      error: (iss) => {
        if (iss.path?.[0] === "email") {
          return "Please enter a valid email";
        }
        if (iss.path?.[0] === "password") {
          return "Enter your password";
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

          {/* FormControl wires the label, the input and the message together
              and sets aria-invalid off the field's own error state, so the ids
              and the invalid flag stop being three things to keep in step by
              hand. */}
          <Form {...form}>
            <form
              onSubmit={(event) => {
                void form.handleSubmit((data) => {
                  signInMutation.mutate(data);
                })(event);
              }}
              className="flex flex-col gap-4"
            >
              <FormField
                name="email"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
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
                    <Link
                      href="/forgot-password"
                      className="self-end text-sm font-semibold text-primary"
                    >
                      Forgot password?
                    </Link>
                  </FormItem>
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
          </Form>

          <Separator className="my-2" />

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
