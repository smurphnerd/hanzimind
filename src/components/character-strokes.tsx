"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface CharacterStrokesProps {
  strokes: string[];
  strokeMedians?: number[][][];
  className?: string;
}

export function CharacterStrokes({
  strokes,
  strokeMedians,
  className = "",
}: CharacterStrokesProps) {
  const [animationKey, setAnimationKey] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate approximate path length for stroke animation
  const getPathLength = (path: string): number => {
    // Simple heuristic: count the number of points/commands in the path
    // A more accurate method would use SVGPathElement.getTotalLength()
    return Math.max(300, path.length * 2);
  };

  // Generate animation styles for each stroke
  const generateAnimationStyles = () => {
    const STROKE_DURATION = 0.6; // seconds per stroke
    const styles: string[] = [];
    let totalDelay = 0;

    strokes.forEach((stroke, index) => {
      const pathLength = getPathLength(stroke);
      const duration = STROKE_DURATION;

      styles.push(`
        @keyframes stroke-${animationKey}-${index} {
          from {
            stroke: #3b82f6;
            stroke-dashoffset: ${pathLength};
            stroke-width: 16;
          }
          65% {
            animation-timing-function: step-end;
            stroke: #3b82f6;
            stroke-dashoffset: 0;
            stroke-width: 16;
          }
          to {
            stroke: #000;
            stroke-width: 16;
          }
        }
        #stroke-${animationKey}-${index} {
          animation: stroke-${animationKey}-${index} ${duration}s both;
          animation-delay: ${totalDelay}s;
          animation-timing-function: linear;
        }
      `);

      totalDelay += duration;
    });

    return styles.join('\n');
  };

  const replay = () => {
    setAnimationKey((prev) => prev + 1);
  };

  useEffect(() => {
    // Auto-play on mount
    setAnimationKey(1);
  }, []);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-center border rounded-lg p-4 bg-white">
        <svg
          ref={svgRef}
          viewBox="0 0 1024 1024"
          className="w-64 h-64"
          xmlns="http://www.w3.org/2000/svg"
        >
          <style type="text/css">
            {animationKey > 0 && generateAnimationStyles()}
          </style>

          {/* Grid lines */}
          <g stroke="lightgray" strokeDasharray="5,5" strokeWidth="2">
            <line x1="0" y1="0" x2="1024" y2="1024"></line>
            <line x1="1024" y1="0" x2="0" y2="1024"></line>
            <line x1="512" y1="0" x2="512" y2="1024"></line>
            <line x1="0" y1="512" x2="1024" y2="512"></line>
          </g>

          {/* Background strokes (light gray) */}
          {strokes.map((stroke, index) => (
            <path
              key={`bg-${index}`}
              d={stroke}
              fill="lightgray"
            />
          ))}

          {/* Animated strokes */}
          {animationKey > 0 && strokes.map((stroke, index) => {
            const pathLength = getPathLength(stroke);
            return (
              <g key={`animated-${animationKey}-${index}`}>
                <clipPath id={`clip-${animationKey}-${index}`}>
                  <path d={stroke} />
                </clipPath>
                <path
                  id={`stroke-${animationKey}-${index}`}
                  d={strokeMedians?.[index]
                    ? `M ${strokeMedians[index].map(([x, y]) => `${x} ${y}`).join(' L ')}`
                    : stroke
                  }
                  clipPath={`url(#clip-${animationKey}-${index})`}
                  fill="none"
                  strokeDasharray={`${pathLength} ${pathLength * 2}`}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={replay}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Replay Animation
        </Button>
      </div>
    </div>
  );
}
