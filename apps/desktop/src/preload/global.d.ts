// Global augmentation for the typed bridge exposed by preload/index.ts.
// NOTE: this file must NOT share a basename with `index.ts` — a sibling
// `index.d.ts` is treated by tsc as that module's emitted declaration and is
// skipped as a program input, so the `declare global` below would never apply.
import type { TrafficGuruApi } from "./index.js";

declare global {
  interface Window {
    trafficguru: TrafficGuruApi;
  }
}

export {};
