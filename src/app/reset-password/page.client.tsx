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
import { authClient } from "@/lib/authClient";
import { z } from "@/lib/zod-jitless";

const ResetPasswordSchema = z
  .object({
    password: z.string().min(10, "Password must be at least 10 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    error: "Both passwords must match",
  });
type ResetPasswordSchema = z.infer<typeof ResetPasswordSchema>;

export default function ResetPasswordClientPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");

  const form = useForm({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const reset = useMutation({
    mutationFn: async (data: ResetPasswordSchema) => {
      const result = await authClient.resetPassword({
        newPassword: data.password,
        token: token ?? "",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not reset the password");
      }
    },
    onSuccess: () => toast.success("Password changed. Sign in with it now."),
    onError: () =>
      toast.error(
        "That link has expired or has already been used. Ask for a new one.",
      ),
  });

  if (!token || linkError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <Card className="w-[32rem] max-w-full">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <Mika pose="peek" size={56} />
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              That link doesn&apos;t work
            </h1>
            <p className="text-muted-foreground">
              A reset link works once and expires in an hour. Ask for a fresh
              one.
            </p>
            <Button asChild className="mt-2">
              <Link href="/forgot-password">Send a new link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (reset.isSuccess) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <Card className="w-[32rem] max-w-full">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <Mika pose="cheer" size={56} />
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              Password changed
            </h1>
            <p className="text-muted-foreground">
              Sign in with your new password.
            </p>
            <Button asChild className="mt-2">
              <Link href="/signin">Go to sign in</Link>
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
              Choose a new password
            </h1>
          </div>

          <Form {...form}>
            <form
              onSubmit={(event) => {
                void form.handleSubmit((data) => reset.mutate(data))(event);
              }}
              className="flex flex-col gap-4"
            >
              <FormField
                name="password"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="confirm"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                isPending={reset.isPending}
                className="mt-2"
                size="lg"
              >
                Set new password
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
