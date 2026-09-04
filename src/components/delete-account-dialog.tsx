"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
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

const CONFIRMATION = "delete";

export function DeleteAccountDialog(props: { baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const requestDeletion = useMutation({
    mutationFn: async () => {
      const result = await authClient.deleteUser({
        callbackURL: `${props.baseUrl}/`,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not start the deletion");
      }
    },
    onSuccess: () => {
      toast.success("Check your email to confirm the deletion.");
      setOpen(false);
      setTyped("");
    },
    onError: () =>
      toast.error("Couldn't start the deletion. Please try again in a minute."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          <Trash2 className="size-4" />
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account</DialogTitle>
          <DialogDescription>
            This removes your account, your decks and everything you have grown.
            It cannot be undone. We email you a link to confirm it.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="confirm-delete">
            Type {CONFIRMATION} to continue
          </FieldLabel>
          <Input
            id="confirm-delete"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => requestDeletion.mutate()}
            isPending={requestDeletion.isPending}
            disabled={typed.trim().toLowerCase() !== CONFIRMATION}
          >
            Email me the link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
