import { Star } from "lucide-react";

interface LevelStarsProps {
  level: number;
  maxLevel?: number;
  size?: "sm" | "md" | "lg";
}

export function LevelStars({
  level,
  maxLevel = 9,
  size = "md",
}: LevelStarsProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  const stars = Math.min(Math.max(0, Math.ceil((level / maxLevel) * 5)), 5);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`${sizeClasses[size]} ${
            index < stars
              ? "fill-yellow-400 text-yellow-400"
              : "fill-none text-muted-foreground"
          }`}
        />
      ))}
    </div>
  );
}
