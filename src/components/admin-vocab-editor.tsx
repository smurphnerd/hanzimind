"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lightbulb, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EditableCell } from "@/components/editable-cell";
import { ManageMemoryAidsDialog } from "@/components/manage-memory-aids-dialog";
import { useTrackedMutation } from "@/hooks/use-tracked-mutation";
import { useORPC } from "@/lib/orpc.client";
import type { VocabItemDetailedDto } from "@/definitions/definitions";

/**
 * Inline admin controls on a dictionary entry — the same edits the admin table
 * offers (reading, definition, component/phonetic/hidden flags and memory-aid
 * curation), so an admin never has to leave the page they are reading to fix it.
 *
 * Rendered only for admins; the server re-checks every `admin.*` procedure, so
 * this decides what to show, never what is permitted.
 *
 * The entry comes from `vocab.get`, which never returns a disabled row, so
 * `disabled` is always false here — the Hidden switch is therefore an off→on
 * action that makes the entry vanish, and on success we route back to the
 * dictionary rather than refetch it into a NOT_FOUND.
 */
export function AdminVocabEditor({ entry }: { entry: VocabItemDetailedDto }) {
  const orpc = useORPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [aidsOpen, setAidsOpen] = useState(false);

  const updateMutation = useTrackedMutation(
    orpc.admin.updateVocabItem.mutationOptions({
      onSuccess: (updated) => {
        // Hiding an item removes it from the dictionary read path; there is
        // nothing left to show on this page, so leave for the listing.
        if (updated.disabled) {
          toast.success(`Hid ${updated.vocabItem}`);
          router.push("/dictionary");
          return;
        }
        toast.success(`Updated ${updated.vocabItem}`);
        void queryClient.invalidateQueries({ queryKey: orpc.vocab.get.key() });
      },
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Failed to update",
        ),
    }),
  );

  // One entity, and every control below is disabled while it writes, so a second
  // write cannot be started. The row-matching the other two sites need does not
  // arise here.
  const isSaving = updateMutation.isPending;

  const update = (patch: Parameters<typeof updateMutation.mutate>[0]) => {
    updateMutation.mutate(patch);
  };

  // Only a single character can meaningfully be a bound form; a word or
  // sentence never is.
  const canBeComponent =
    entry.vocabType === "character" || entry.vocabType === "component";

  return (
    <Card className="mb-6 border-dashed border-primary/40 bg-secondary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl tracking-tight">
          <ShieldCheck className="size-5 text-primary" />
          Admin controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Reading
            </span>
            <EditableCell
              serverValue={entry.pinyin}
              allowEmpty
              isSaving={isSaving}
              ariaLabel={`Reading for ${entry.vocabItem}`}
              placeholder="No reading"
              inputClassName="hanzi"
              onSave={(pinyin) => update({ id: entry.id, pinyin })}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Definition
            </span>
            <EditableCell
              serverValue={entry.translation ?? ""}
              allowEmpty={false}
              isSaving={isSaving}
              ariaLabel={`Definition for ${entry.vocabItem}`}
              placeholder="No definition"
              onSave={(translation) => update({ id: entry.id, translation })}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {canBeComponent && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={entry.vocabType === "component"}
                disabled={isSaving}
                aria-label={`Mark ${entry.vocabItem} as a component`}
                onCheckedChange={(checked) =>
                  update({
                    id: entry.id,
                    vocabType: checked ? "component" : "character",
                  })
                }
              />
              Component
            </label>
          )}
          {/* Only a component has a reading worth *not* teaching: everything else
              is quizzed on its own pinyin anyway. */}
          {entry.vocabType === "component" && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={entry.phonetic}
                disabled={isSaving}
                aria-label={`Teach the sound of ${entry.vocabItem}`}
                onCheckedChange={(checked) =>
                  update({ id: entry.id, phonetic: checked })
                }
              />
              Phonetic
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={false}
              disabled={isSaving}
              aria-label={`Hide ${entry.vocabItem}`}
              onCheckedChange={(checked) =>
                update({ id: entry.id, disabled: checked })
              }
            />
            Hidden
          </label>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setAidsOpen(true)}
          >
            <Lightbulb className="size-4" />
            Manage memory aids
          </Button>
        </div>
      </CardContent>

      <ManageMemoryAidsDialog
        item={{ id: entry.id, vocabItem: entry.vocabItem }}
        open={aidsOpen}
        onOpenChange={setAidsOpen}
      />
    </Card>
  );
}
