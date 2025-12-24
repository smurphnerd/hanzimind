"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DeckSettings = {
  includeConstituents: boolean;
  readingEnabled: boolean;
  listeningEnabled: boolean;
  understandingEnabled: boolean;
  writingEnabled: boolean;
};

interface DeckSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DeckSettings;
  onSettingsChange: (settings: DeckSettings) => void;
  onSave: () => void;
  isPending?: boolean;
  title?: string;
  description?: string;
  saveButtonText?: string;
}

export function DeckSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  onSave,
  isPending = false,
  title = "Configure Study Settings",
  description = "Choose which study modes to enable and whether to include constituent characters.",
  saveButtonText = "Save Settings",
}: DeckSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="constituents" className="cursor-pointer">
              Include constituent characters
            </Label>
            <Switch
              id="constituents"
              checked={settings.includeConstituents}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, includeConstituents: checked })
              }
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Study Types</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="reading" className="cursor-pointer">
                  Reading
                </Label>
                <Switch
                  id="reading"
                  checked={settings.readingEnabled}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, readingEnabled: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="listening" className="cursor-pointer">
                  Listening
                </Label>
                <Switch
                  id="listening"
                  checked={settings.listeningEnabled}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      listeningEnabled: checked,
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="understanding" className="cursor-pointer">
                  Understanding
                </Label>
                <Switch
                  id="understanding"
                  checked={settings.understandingEnabled}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      understandingEnabled: checked,
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="writing" className="cursor-pointer">
                  Writing
                </Label>
                <Switch
                  id="writing"
                  checked={settings.writingEnabled}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, writingEnabled: checked })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saving..." : saveButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
