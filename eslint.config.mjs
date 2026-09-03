import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Zod probes `Function("")` when a schema is built, which a strict CSP
    // refuses and the browser reports. `@/lib/zod-jitless` turns the probe off
    // and re-exports `z`, so client code takes it from there.
    files: ["src/{app,components,lib,definitions}/**/*.{ts,tsx}"],
    ignores: ["src/lib/zod-jitless.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message:
                'Import { z } from "@/lib/zod-jitless" so Zod is configured jitless before any schema is built.',
            },
            {
              name: "zod/v4",
              message:
                'Import { z } from "@/lib/zod-jitless" so Zod is configured jitless before any schema is built.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Other agents' git worktrees are separate checkouts of this same repo:
    // linting them from here reports every problem twice.
    ".claude/**",
  ]),
]);

export default eslintConfig;
