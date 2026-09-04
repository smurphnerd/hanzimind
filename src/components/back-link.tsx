import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/** The "back to the list" link above a detail page. */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary",
        className,
      )}
    >
      <ChevronLeft className="size-4" />
      {children}
    </Link>
  );
}
