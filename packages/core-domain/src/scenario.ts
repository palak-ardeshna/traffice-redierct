/**
 * Canonical Scenario JSON — schema `flowpilot.scenario/v1` (blueprint §10.6).
 *
 * This is the versioned, editable artifact the recorder emits and the automation
 * engine executes. The `schema` discriminator lets a migration layer upgrade old
 * scenarios as the format evolves. PURE domain — no I/O (blueprint §5 / §18).
 */

import { z } from "zod";

export const LocatorStrategy = z.enum([
  "getByRole",
  "getByLabel",
  "getByText",
  "getByTestId",
  "css",
  "xpath",
]);

export const Locator = z.object({
  strategy: LocatorStrategy,
  value: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  /** Ranked fallbacks used by the self-heal path (blueprint §10.2). */
  fallbacks: z.array(z.object({ strategy: LocatorStrategy, value: z.string() })).optional(),
  /** 0–1 stability score surfaced in the recorder UI. */
  stability: z.number().min(0).max(1).optional(),
});
export type Locator = z.infer<typeof Locator>;

export const RetryPolicy = z.object({
  max: z.number().int().min(0).max(10),
  backoffMs: z.number().int().min(0),
});

const BaseStep = z.object({
  id: z.string().min(1),
  retry: RetryPolicy.optional(),
});

export const Step = z.discriminatedUnion("action", [
  BaseStep.extend({ action: z.literal("navigate"), url: z.string() }),
  BaseStep.extend({ action: z.literal("click"), locator: Locator }),
  BaseStep.extend({ action: z.literal("fill"), locator: Locator, text: z.string() }),
  BaseStep.extend({
    action: z.literal("assert"),
    type: z.enum(["urlContains", "visible", "text", "value"]),
    locator: Locator.optional(),
    value: z.string(),
  }),
  BaseStep.extend({ action: z.literal("wait"), ms: z.number().int().optional(), locator: Locator.optional() }),
  BaseStep.extend({
    action: z.literal("screenshot"),
    kind: z.enum(["full", "element", "viewport"]).default("full"),
    name: z.string().optional(),
    locator: Locator.optional(),
  }),
  BaseStep.extend({ action: z.literal("script"), code: z.string() }),
]);
export type Step = z.infer<typeof Step>;

export const ScenarioVariable = z.object({
  type: z.enum(["string", "number", "secret"]),
  ref: z.string().optional(), // keychain reference for secrets — never the value
  default: z.string().optional(),
});

export const ScenarioDefinition = z.object({
  schema: z.literal("flowpilot.scenario/v1"),
  name: z.string().min(1),
  type: z.enum(["test", "audit", "crawl", "screenshot", "composite"]).default("test"),
  variables: z.record(z.string(), ScenarioVariable).optional(),
  steps: z.array(Step).min(1),
  on: z
    .object({
      failure: z
        .object({ capture: z.array(z.enum(["screenshot", "trace", "har"])) })
        .optional(),
    })
    .optional(),
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinition>;

/** Parse-and-validate helper — throws a zod error the service layer maps to ValidationError. */
export function parseScenario(input: unknown): ScenarioDefinition {
  return ScenarioDefinition.parse(input);
}
