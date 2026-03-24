import { z } from "zod";
import { AGENT_BACKENDS, AGENT_MODES } from "../shared/types.js";
import {
  DEFAULT_AGENT,
  DEFAULT_CONCURRENCY,
  DEFAULT_TRIGGER,
  DEFAULT_WORKSPACE,
} from "./defaults.js";

// Accepts `{ cron: "0 9 * * *" }` and normalises it to the canonical form.
const triggerCronShorthand = z.object({ cron: z.string() }).transform((val) => ({
  type: "cron" as const,
  schedule: val.cron,
}));

const triggerExplicit = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("cron"), schedule: z.string() }),
]);

// Union is tried left-to-right; shorthand is tried first so the transform fires
// before the explicit discriminated union catches it as an error.
const triggerSchema = z.union([triggerCronShorthand, triggerExplicit]).default(DEFAULT_TRIGGER);

const agentSchema = z
  .object({
    backend: z.enum(AGENT_BACKENDS).default(DEFAULT_AGENT.backend),
    mode: z.enum(AGENT_MODES).default(DEFAULT_AGENT.mode),
    model: z.string().optional(),
    // Zod v4 requires two arguments for z.record; single-arg form breaks on parse
    provider_options: z.record(z.string(), z.unknown()).default(DEFAULT_AGENT.provider_options),
  })
  .default(DEFAULT_AGENT);

const workspaceSchema = z
  .object({
    root: z.string().default(DEFAULT_WORKSPACE.root),
    hooks: z
      .object({
        after_create: z.string().optional(),
        before_run: z.string().optional(),
      })
      .default(DEFAULT_WORKSPACE.hooks),
  })
  .default(DEFAULT_WORKSPACE);

const concurrencySchema = z
  .object({
    max: z.number().int().positive().default(DEFAULT_CONCURRENCY.max),
    on_conflict: z.enum(["skip", "queue"]).default(DEFAULT_CONCURRENCY.on_conflict),
  })
  .default(DEFAULT_CONCURRENCY);

const notifyChannelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("desktop") }),
  z.object({ type: z.literal("webhook"), url: z.string() }),
]);

const notifySchema = z
  .object({
    channels: z.array(notifyChannelSchema).default([]),
    on: z
      .object({
        completed: z.boolean().default(true),
        failed: z.boolean().default(true),
        needs_input: z.boolean().default(true),
      })
      .default({ completed: true, failed: true, needs_input: true }),
  })
  .optional();

export const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: triggerSchema,
  agent: agentSchema,
  // Zod v4 requires two arguments for z.record; single-arg form breaks on parse
  context: z.record(z.string(), z.string()).default({}),
  workspace: workspaceSchema,
  concurrency: concurrencySchema,
  notify: notifySchema,
  prompt: z.string().min(1),
});

export type WorkflowSchemaInput = z.input<typeof workflowSchema>;
export type WorkflowSchemaOutput = z.output<typeof workflowSchema>;
