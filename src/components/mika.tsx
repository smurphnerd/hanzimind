import * as React from "react";

export type MikaPose = "wave" | "cheer" | "read" | "sleep" | "peek";

interface MikaProps extends React.SVGProps<SVGSVGElement> {
  pose?: MikaPose;
  size?: number;
}

/**
 * Mika — HanziMind's red-panda mascot. A self-contained inline SVG so it works
 * offline and on any background. Fixed panda palette (reads as a red panda in
 * both light and dark themes).
 */
export function Mika({ pose = "wave", size = 96, ...props }: MikaProps) {
  const fur = "#e0692f";
  const furDark = "#c65a2e";
  const cream = "#fbefe6";
  const ink = "#2b2130";
  const sleeping = pose === "sleep";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Mika the red panda"
      {...props}
    >
      {/* arms (behind head) */}
      {pose === "cheer" && (
        <g>
          <path
            d="M31 62c-6-2-10-8-10-15"
            fill="none"
            stroke={furDark}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <path
            d="M89 62c6-2 10-8 10-15"
            fill="none"
            stroke={furDark}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <circle cx="19" cy="45" r="6.5" fill={fur} />
          <circle cx="101" cy="45" r="6.5" fill={fur} />
        </g>
      )}
      {pose === "wave" && (
        <g>
          <path
            d="M92 60c7-1 12-6 13-14"
            fill="none"
            stroke={furDark}
            strokeWidth={7}
            strokeLinecap="round"
          />
          <circle cx="107" cy="42" r="6.5" fill={fur} />
        </g>
      )}

      {/* ears */}
      <path d="M28 34c-6-14-2-24 8-24 6 0 9 6 9 15Z" fill={furDark} />
      <path d="M92 34c6-14 2-24-8-24-6 0-9 6-9 15Z" fill={furDark} />
      <path d="M31 30c-3-8-1-14 4-14 3 0 5 4 5 9Z" fill={cream} />
      <path d="M89 30c3-8 1-14-4-14-3 0-5 4-5 9Z" fill={cream} />

      {/* face */}
      <ellipse cx="60" cy="60" rx="42" ry="38" fill={fur} />
      <path
        d="M60 44c18 0 30 9 30 22 0 15-14 24-30 24S30 81 30 66c0-13 12-22 30-22Z"
        fill={cream}
      />
      <ellipse cx="30" cy="58" rx="12" ry="14" fill={cream} />
      <ellipse cx="90" cy="58" rx="12" ry="14" fill={cream} />
      <ellipse cx="44" cy="46" rx="10" ry="8" fill={cream} />
      <ellipse cx="76" cy="46" rx="10" ry="8" fill={cream} />

      {/* eyes */}
      {sleeping ? (
        <g stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none">
          <path d="M39 56c2 3 8 3 11 0" />
          <path d="M70 56c2 3 8 3 11 0" />
        </g>
      ) : (
        <g>
          <circle cx="45" cy="56" r="7" fill={ink} />
          <circle cx="75" cy="56" r="7" fill={ink} />
          <circle cx="47" cy="54" r="2.4" fill="#fff" />
          <circle cx="77" cy="54" r="2.4" fill="#fff" />
        </g>
      )}

      {/* tear marks */}
      <path
        d="M45 63c-2 6-4 9-9 12"
        stroke={furDark}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M75 63c2 6 4 9 9 12"
        stroke={furDark}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />

      {/* nose + smile */}
      <path d="M56 66h8l-4 5Z" fill={ink} />
      <path
        d="M60 71c0 4 4 6 8 5"
        stroke={ink}
        strokeWidth={2.6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M60 71c0 4-4 6-8 5"
        stroke={ink}
        strokeWidth={2.6}
        fill="none"
        strokeLinecap="round"
      />

      {sleeping && (
        <text
          x="96"
          y="30"
          fontSize="14"
          fontWeight="700"
          fill={furDark}
          fontFamily="var(--font-display), sans-serif"
        >
          z
        </text>
      )}
    </svg>
  );
}
