// Runtime access-gate configuration.
//
// Originally a classic <script> tag that only wrote window.* globals.
// Converted to an ES module so config can be imported directly:
//   import { BONSAI_REQUIRE_HF_TOKEN } from "./config.js";
//
// The window.* side effects are preserved for legacy callers that
// still reach for window.__BONSAI_HOLD_LANDING before module evaluation
// has completed (e.g. inline scripts that run before <script type="module">).

export const BONSAI_REQUIRE_HF_TOKEN = false;

if (typeof window !== "undefined") {
  window.BONSAI_REQUIRE_HF_TOKEN = BONSAI_REQUIRE_HF_TOKEN;
  window.__BONSAI_HOLD_LANDING = BONSAI_REQUIRE_HF_TOKEN;
}
