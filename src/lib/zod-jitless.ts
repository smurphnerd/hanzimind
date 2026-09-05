import * as z from "zod/v4";

// Zod probes `Function("")` when a schema is built to decide whether it may
// compile parsers. Under the production CSP that probe is refused, and the
// browser reports a script-src violation even though Zod catches the throw.
// Saying jitless up front skips it; parsing is otherwise unchanged. Client
// modules import `z` from here so the config always precedes their schemas,
// which the no-restricted-imports rule in eslint.config.mjs enforces.
z.config({ jitless: true });

export { z };
