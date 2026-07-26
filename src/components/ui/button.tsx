import { cva, type VariantProps } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/components/ui-utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-display text-sm font-bold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border border-border bg-surface text-foreground shadow-sm hover:bg-muted hover:border-primary/40",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 px-4 text-xs has-[>svg]:px-3",
        lg: "h-12 px-8 text-base has-[>svg]:px-5",
        icon: "size-10 text-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  isPending,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    isPending?: boolean;
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isPending || disabled}
      {...props}
    />
  );
}

export { Button, buttonVariants };
