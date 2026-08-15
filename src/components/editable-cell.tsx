"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A single-field inline editor — commits on blur or Enter, reverts on Escape.
 *
 * `allowEmpty` distinguishes the two columns that use it: a definition is the
 * only thing a component can be quizzed on, so blanking it is refused and the
 * field snaps back; a reading may legitimately be empty, so an empty commit is
 * sent through.
 *
 * Shared by the admin vocab table and the inline admin editor on a dictionary
 * entry, so the two never drift.
 */
export function EditableCell({
  serverValue,
  allowEmpty,
  onSave,
  isSaving,
  ariaLabel,
  placeholder,
  inputClassName,
}: {
  serverValue: string;
  allowEmpty: boolean;
  onSave: (value: string) => void;
  isSaving: boolean;
  ariaLabel: string;
  placeholder: string;
  inputClassName?: string;
}) {
  const [value, setValue] = useState(serverValue);
  const [isEditing, setIsEditing] = useState(false);

  // The row can be re-fetched under us after a save elsewhere; while the field
  // is untouched, follow the server's value rather than the stale local one.
  if (!isEditing && value !== serverValue) setValue(serverValue);

  const commit = () => {
    setIsEditing(false);
    const trimmed = value.trim();
    if (trimmed === serverValue || (!allowEmpty && trimmed.length === 0)) {
      setValue(serverValue);
      return;
    }
    onSave(trimmed);
  };

  return (
    <Input
      value={value}
      disabled={isSaving}
      aria-label={ariaLabel}
      onChange={(event) => {
        setIsEditing(true);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(serverValue);
          setIsEditing(false);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-8 text-sm",
        !allowEmpty && !serverValue && "border-destructive/50",
        inputClassName,
      )}
      placeholder={placeholder}
    />
  );
}
