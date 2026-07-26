"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CharacterStrokesProps {
  strokes: string[];
  strokeMedians?: number[][][];
  className?: string;
  /** Seconds per stroke. */
  strokeDuration?: number;
}

/**
 * Renders a makemeahanzi stroke-order animation.
 *
 * The makemeahanzi dataset (github.com/skishore/makemeahanzi) stores glyph
 * outlines in a font em-box whose Y axis points UP, so everything must be
 * rendered inside `transform="scale(1, -1) translate(0, -900)"` to appear
 * upright in SVG's Y-down space.
 *
 * Each stroke is drawn by sweeping a very thick line along the stroke's median
 * (centreline) while clipping it to the stroke's outline — the classic
 * "write the stroke" effect. The line must be thicker than the widest stroke
 * (~160 units in a 1024 em-box) for the outline to fill completely.
 */
const MEDIAN_STROKE_WIDTH = 160;

/**
 * Dash offset that leaves a stroke completely invisible.
 *
 * A round line cap is still painted for a zero-length dash, which would show a
 * blob at each not-yet-drawn stroke's starting point. Pushing the dash back by
 * half the stroke width parks that cap exactly at the path start, so it has no
 * visible area.
 */
function hiddenOffset(length: number) {
  return length + MEDIAN_STROKE_WIDTH / 2;
}

export function CharacterStrokes({
  strokes,
  strokeMedians,
  className = "",
  strokeDuration = 0.6,
}: CharacterStrokesProps) {
  const [runId, setRunId] = useState(1);

  const paths = useMemo(
    () =>
      strokes.map((stroke, index) => {
        const median = strokeMedians?.[index];
        if (!median || median.length < 2) {
          return { stroke, median: null, length: 0 };
        }
        // Exact polyline length — a string-length heuristic makes the reveal
        // finish early or late on individual strokes.
        let length = 0;
        for (let i = 1; i < median.length; i++) {
          length += Math.hypot(
            median[i][0] - median[i - 1][0],
            median[i][1] - median[i - 1][1],
          );
        }
        const d = `M ${median.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
        return { stroke, median: d, length };
      }),
    [strokes, strokeMedians],
  );

  const css = useMemo(() => {
    return paths
      .map((p, i) => {
        const delay = i * strokeDuration;
        return p.median
          ? `
        @keyframes draw-${runId}-${i} {
          from { stroke-dashoffset: ${hiddenOffset(p.length)}; stroke: var(--accent); }
          70%  { stroke: var(--accent); }
          to   { stroke-dashoffset: 0; stroke: var(--foreground); }
        }
        #median-${runId}-${i} {
          animation: draw-${runId}-${i} ${strokeDuration}s linear ${delay}s both;
        }`
          : `
        @keyframes fade-${runId}-${i} {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        #fill-${runId}-${i} {
          animation: fade-${runId}-${i} ${strokeDuration}s linear ${delay}s both;
        }`;
      })
      .join("\n");
  }, [paths, runId, strokeDuration]);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="border-border bg-surface flex items-center justify-center rounded-lg border p-4">
        <svg
          viewBox="0 0 1024 1024"
          className="h-64 w-64"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Stroke order animation"
        >
          <style>{css}</style>

          <defs>
            {paths.map((p, i) => (
              <clipPath key={`clip-${runId}-${i}`} id={`clip-${runId}-${i}`}>
                <path d={p.stroke} />
              </clipPath>
            ))}
          </defs>

          {/* makemeahanzi glyphs are Y-up; flip into SVG's Y-down space. */}
          <g transform="scale(1, -1) translate(0, -900)">
            {/* Faint guide grid */}
            <g
              stroke="var(--border)"
              strokeDasharray="16,16"
              strokeWidth="2"
              opacity="0.7"
            >
              <line x1="0" y1="0" x2="1024" y2="1024" />
              <line x1="1024" y1="0" x2="0" y2="1024" />
              <line x1="512" y1="0" x2="512" y2="1024" />
              <line x1="0" y1="512" x2="1024" y2="512" />
            </g>

            {/* Ghost of the finished character */}
            {paths.map((p, i) => (
              <path
                key={`bg-${i}`}
                d={p.stroke}
                fill="var(--muted-foreground)"
                opacity="0.18"
              />
            ))}

            {/* Animated strokes */}
            {paths.map((p, i) =>
              p.median ? (
                <g key={`draw-${runId}-${i}`} clipPath={`url(#clip-${runId}-${i})`}>
                  <path
                    id={`median-${runId}-${i}`}
                    d={p.median}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={MEDIAN_STROKE_WIDTH}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    // Gap is wider than the dash so the pattern never repeats
                    // and reveals a second segment further along the path.
                    strokeDasharray={`${p.length} ${p.length + MEDIAN_STROKE_WIDTH}`}
                    strokeDashoffset={hiddenOffset(p.length)}
                  />
                </g>
              ) : (
                <path
                  key={`fill-${runId}-${i}`}
                  id={`fill-${runId}-${i}`}
                  d={p.stroke}
                  fill="var(--foreground)"
                />
              ),
            )}
          </g>
        </svg>
      </div>

      <div className="flex items-center justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRunId((n) => n + 1)}
        >
          <RotateCcw className="size-4" />
          Replay animation
        </Button>
      </div>
    </div>
  );
}
