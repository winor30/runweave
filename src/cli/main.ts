function printHelp(): void {
  console.log(`Usage: runweave <command> [options]

Commands:
  start              Start daemon (schedule all workflows)
  run <workflow>     Execute a single workflow immediately
  status             Show session status
  logs <session-id>  Show session logs
  attach <session-id> Attach to a running session
  stop [session-id]  Stop a session or the daemon
  validate [path]    Validate workflow YAML (file or directory)
  init               Initialize a new runweave project

Options:
  --help, -h         Show this help message`);
}

export async function main(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return;
  }

  const command = argv[0];
  const commandArgs = argv.slice(1);

  switch (command) {
    case "validate": {
      const { validateCommand } = await import("./commands/validate.js");
      return validateCommand(commandArgs);
    }
    case "init": {
      const { initCommand } = await import("./commands/init.js");
      return initCommand(commandArgs);
    }
    case "run": {
      const { runCommand } = await import("./commands/run.js");
      return runCommand(commandArgs);
    }
    case "start": {
      const { startCommand } = await import("./commands/start.js");
      return startCommand(commandArgs);
    }
    case "status": {
      const { statusCommand } = await import("./commands/status.js");
      return statusCommand(commandArgs);
    }
    case "logs": {
      const { logsCommand } = await import("./commands/logs.js");
      return logsCommand(commandArgs);
    }
    case "attach": {
      const { attachCommand } = await import("./commands/attach.js");
      return attachCommand(commandArgs);
    }
    case "stop": {
      const { stopCommand } = await import("./commands/stop.js");
      return stopCommand(commandArgs);
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}
