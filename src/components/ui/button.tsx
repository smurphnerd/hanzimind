import { cva, type VariantProps } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/components/ui-utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-md border-2 border-gold hover:bg-vermillion hover:border-gold-bright hover:shadow-lg",
        destructive:
          "bg-destructive text-white shadow-md border-2 border-destructive/50 hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border-2 border-gold bg-transparent text-primary shadow-sm hover:bg-primary/10 hover:border-gold-bright",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm border border-gold/50 hover:bg-secondary/80 hover:border-gold",
        ghost:
          "text-primary hover:bg-primary/10 hover:text-vermillion",
        link: "text-primary underline-offset-4 hover:underline hover:text-vermillion",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-lg px-8 text-base has-[>svg]:px-5",
        icon: "size-10 rounded-full text-xl",
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
