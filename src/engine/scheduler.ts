import { Cron } from "croner";
import { watch } from "node:fs";
import type { Executor } from "./executor.js";
import type { WorkflowConfig } from "../shared/types.js";
import type { Logger } from "../logging/logger.js";
import { loadAllWorkflows } from "../config/load.js";

/**
 * Manages cron-triggered workflow scheduling.
 *
 * Responsibilities:
 * - Register/unregister Cron jobs via the `croner` library.
 * - Watch a YAML directory for changes and hot-reload affected workflows
 *   without restarting the process.
 * - Perform a graceful shutdown by stopping all jobs and closing the
 *   filesystem watcher.
 */
export class Scheduler {
  private jobs = new Map<string, Cron>();
  private workflows = new Map<string, WorkflowConfig>();
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(
    private readonly executor: Executor,
    private readonly logger: Logger,
  ) {}

  /**
   * Registers a cron job for the given workflow.
   *
   * Manual workflows are silently ignored — they have no schedule.
   * If the workflow is already registered, the existing job is stopped before
   * the new one is created so that hot-reload does not duplicate schedules.
   */
  register(wf: WorkflowConfig): void {
    if (wf.trigger.type !== "cron") return;

    // Unregister first to avoid duplicate jobs during hot reload
    this.unregister(wf.name);

    const job = new Cron(wf.trigger.schedule, async () => {
      this.logger.info("Cron triggered", { workflow: wf.name });
      try {
        await this.executor.execute(wf);
      } catch (err) {
        this.logger.error("Workflow execution failed", {
          workflow: wf.name,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    });

    this.jobs.set(wf.name, job);
    this.workflows.set(wf.name, wf);
    this.logger.info("Registered cron workflow", {
      workflow: wf.name,
      schedule: wf.trigger.schedule,
    });
  }

  /** Stops and removes a registered cron job. No-op for unknown names. */
  unregister(name: string): void {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      this.workflows.delete(name);
    }
  }

  /** Returns the names of all currently registered cron workflows. */
  getRegistered(): string[] {
    return [...this.jobs.keys()];
  }

  /**
   * Watches a workflows directory for YAML changes and re-registers
   * modified workflows without downtime.
   *
   * Workflows removed from disk are unregistered; new or updated workflows
   * are (re-)registered. Parse errors are logged without crashing the watcher.
   */
  watchDirectory(dir: string): void {
    this.watcher = watch(dir, { recursive: true }, async (_eventType, filename) => {
      if (!filename?.endsWith(".yaml") && !filename?.endsWith(".yml")) return;
      this.logger.info("Workflow file changed, reloading", { file: filename });
      try {
        const { workflows, errors } = await loadAllWorkflows(dir);
        // Unregister any workflow whose file was deleted
        for (const name of this.getRegistered()) {
          if (!workflows.find((w) => w.name === name)) {
            this.unregister(name);
          }
        }
        // Re-register all successfully loaded workflows
        for (const wf of workflows) {
          this.register(wf);
        }
        for (const { file, error } of errors) {
          this.logger.error("Failed to reload workflow", { file, error });
        }
      } catch (err) {
        this.logger.error("Hot reload failed", {
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    });
  }

  /** Stops all cron jobs and the filesystem watcher. */
  stopAll(): void {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
    this.workflows.clear();
    this.watcher?.close();
    this.watcher = null;
  }
}
