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
import { Label } from "@/components/ui/label";
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
      toast.success(
        `Step one sent to ${props.currentEmail}. Two emails to go.`,
      );
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
            Changing it takes two emails. First we send a confirmation to{" "}
            {props.currentEmail}, the address on file. Clicking that sends a
            second email to the new address, and clicking the one in there is
            what makes the change. Your account keeps its current address until
            both are done, and if you ask more than once, use only the most
            recent pair: an older link still works for an hour.
          </DialogDescription>
        </DialogHeader>
        {/* Not a react-hook-form field, so `grid gap-2` and a plain
            Label, which is what shadcn's own FormItem and FormLabel are. */}
        <div className="grid gap-2">
          <Label htmlFor="new-email">New email</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </div>
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
