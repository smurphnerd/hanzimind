import { Card, CardContent } from "@/components/ui/card";
import { Mika, type MikaPose } from "@/components/mika";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  pose?: MikaPose;
  action?: React.ReactNode;
  /** Render bare, without the surrounding Card — for empty states already inside one. */
  bare?: boolean;
  className?: string;
}

/**
 * The one empty state for the whole app: Mika, a line of explanation, and a way
 * out. Card already supplies `py-6`, so the inner padding here is additive by
 * design and deliberately modest.
 */
export function EmptyState({
  title,
  description,
  pose = "sleep",
  action,
  bare = false,
  className,
}: EmptyStateProps) {
  const body = (
    <div
      className={cn(
        "flex flex-col items-center gap-4 py-10 text-center",
        className,
      )}
    >
      <Mika pose={pose} size={88} />
      <div className="space-y-1">
        <p className="font-display text-lg font-bold">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );

  if (bare) return body;

  return (
    <Card>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
