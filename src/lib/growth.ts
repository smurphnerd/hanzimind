type GrowthStageKey =
  | "none"
  | "seedling"
  | "sprout"
  | "sapling"
  | "blooming"
  | "evergreen";

interface GrowthStage {
  key: GrowthStageKey;
  index: number; // 0..5
  label: string;
  colorClass: string; // text-stage-*
  fillClass: string; // bg-stage-*
}

export const GROWTH_STAGES: GrowthStage[] = [
  {
    key: "none",
    index: 0,
    label: "Not started",
    colorClass: "text-stage-none",
    fillClass: "bg-stage-none",
  },
  {
    key: "seedling",
    index: 1,
    label: "Seedling",
    colorClass: "text-stage-seedling",
    fillClass: "bg-stage-seedling",
  },
  {
    key: "sprout",
    index: 2,
    label: "Sprout",
    colorClass: "text-stage-sprout",
    fillClass: "bg-stage-sprout",
  },
  {
    key: "sapling",
    index: 3,
    label: "Sapling",
    colorClass: "text-stage-sapling",
    fillClass: "bg-stage-sapling",
  },
  {
    key: "blooming",
    index: 4,
    label: "Blooming",
    colorClass: "text-stage-blooming",
    fillClass: "bg-stage-blooming",
  },
  {
    key: "evergreen",
    index: 5,
    label: "Evergreen",
    colorClass: "text-stage-evergreen",
    fillClass: "bg-stage-evergreen",
  },
];

/** SRS level is an integer 0–5; maps directly onto the 6 growth stages. */
export function growthStage(level: number): GrowthStage {
  // Guard against undefined/NaN reaching us from callers — never return
  // undefined, since consumers read properties off the result directly.
  const n = Number.isFinite(level) ? level : 0;
  const i = Math.max(0, Math.min(5, Math.round(n)));
  return GROWTH_STAGES[i] ?? GROWTH_STAGES[0];
}
