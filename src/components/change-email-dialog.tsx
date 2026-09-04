"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/authClient";

export function ChangeEmailDialog(props: {
  currentEmail: string;
  baseUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const changeEmail = useMutation({
    mutationFn: async () => {
      const result = await authClient.changeEmail({
        newEmail,
        callbackURL: `${props.baseUrl}/profile`,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not change the email");
      }
    },
    onSuccess: () => {
      toast.success(`Confirm the change from ${props.currentEmail}.`);
      setOpen(false);
      setNewEmail("");
    },
    onError: () =>
      toast.error("Couldn't start the change. Please try again in a minute."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail className="size-4" />
          Change email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change your email</DialogTitle>
          <DialogDescription>
            We send the confirmation to {props.currentEmail}, the address on
            file. Your account keeps it until you click that link.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="new-email">New email</FieldLabel>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => changeEmail.mutate()}
            isPending={changeEmail.isPending}
            disabled={!newEmail.includes("@")}
          >
            Send confirmation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
