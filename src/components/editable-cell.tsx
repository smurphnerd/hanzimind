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
function EditableCellField({
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

  const commit = () => {
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
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(serverValue);
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

/**
 * Keyed on the server's value, so a row re-fetched under the editor starts
 * again from what the server now holds instead of resyncing during render.
 */
export function EditableCell(
  props: React.ComponentProps<typeof EditableCellField>,
) {
  return <EditableCellField key={props.serverValue} {...props} />;
}
