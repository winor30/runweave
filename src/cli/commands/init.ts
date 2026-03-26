import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const EXAMPLE_WORKFLOW = `name: hello-world
description: "Example workflow - manually triggered"
prompt: |
  Say hello and list the files in the current directory.
`;

const GITIGNORE_CONTENT = `.runweave-workspaces/
.runweave-sessions/
node_modules/
dist/
`;

/**
 * Initializes a runweave project by creating:
 * - workflows/example.yaml  (only if the file does not already exist)
 * - .gitignore              (only if the file does not already exist)
 *
 * Skips writing a file that already exists to avoid clobbering user content.
 */
export async function initCommand(args: string[]): Promise<void> {
  const dir = args[0] ?? process.cwd();

  await mkdir(join(dir, "workflows"), { recursive: true });

  const examplePath = join(dir, "workflows", "example.yaml");
  if (!existsSync(examplePath)) {
    await writeFile(examplePath, EXAMPLE_WORKFLOW, "utf-8");
    console.log(`Created ${examplePath}`);
  }

  const gitignorePath = join(dir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    await writeFile(gitignorePath, GITIGNORE_CONTENT, "utf-8");
    console.log(`Created ${gitignorePath}`);
  }

  console.log("Initialized runweave project.");
}
