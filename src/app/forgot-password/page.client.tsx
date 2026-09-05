"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
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
import { authClient } from "@/lib/authClient";
import { z } from "@/lib/zod-jitless";

const ForgotPasswordSchema = z.object({ email: z.email() });
type ForgotPasswordSchema = z.infer<typeof ForgotPasswordSchema>;

export default function ForgotPasswordClientPage(props: { baseUrl: string }) {
  const form = useForm({
    resolver: zodResolver(ForgotPasswordSchema, {
      error: () => "Please enter a valid email",
    }),
    defaultValues: { email: "" },
  });

  const requestReset = useMutation({
    mutationFn: async (data: ForgotPasswordSchema) => {
      const result = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: `${props.baseUrl}/reset-password`,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not send the email");
      }
    },
    onError: () =>
      toast.error("Couldn't send the email. Please try again in a minute."),
  });

  // Always the same answer, sent or not: telling a stranger which addresses
  // have accounts is the one thing this form must not do.
  if (requestReset.isSuccess) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <Card className="w-[32rem] max-w-full">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <Mika pose="wave" size={56} />
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              Check your email
            </h1>
            <p className="text-muted-foreground">
              If {form.getValues("email")} has an account, a reset link is on
              its way. It works once and expires in an hour.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/signin">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8">
      <Card className="w-[32rem] max-w-full">
        <CardContent className="flex flex-col gap-4 py-8">
          <div className="flex flex-col items-center gap-2">
            <Mika pose="read" size={56} />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
              Forgot your password?
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a link to set a new one.
            </p>
          </div>

          <Form {...form}>
            <form
              onSubmit={(event) => {
                void form.handleSubmit((data) => requestReset.mutate(data))(
                  event,
                );
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
              <Button
                type="submit"
                isPending={requestReset.isPending}
                className="mt-2"
                size="lg"
              >
                Send reset link
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/signin" className="font-semibold text-primary">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
