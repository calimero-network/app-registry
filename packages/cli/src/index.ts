import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { appsCommand } from './commands/apps.js';
import { developersCommand } from './commands/developers.js';
import { attestationsCommand } from './commands/attestations.js';
import { healthCommand } from './commands/health.js';
import { ipfsCommand } from './commands/ipfs.js';
import { localCommand } from './commands/local.js';
import { bundleCommand } from './commands/bundle.js';
import { configCommand } from './commands/config.js';
import { orgCommand } from './commands/org.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('calimero-registry')
  .description(
    'Calimero Network App Registry CLI - Command-line interface for the App Registry'
  )
  .version(version);

// Global help text with examples
program.addHelpText(
  'after',
  `
Examples:
  $ calimero-registry apps list
  $ calimero-registry apps create --file manifest.json
  $ calimero-registry local start
  $ calimero-registry health --local

For more information, visit: https://github.com/calimero-network/app-registry
`
);

// Global options
program.option('-u, --url <url>', 'Registry API URL', 'http://localhost:8082');
program.option(
  '-t, --timeout <timeout>',
  'Request timeout in milliseconds',
  '10000'
);
program.option('--local', 'Use local registry instead of remote API');

// Add commands
program.addCommand(appsCommand);
program.addCommand(developersCommand);
program.addCommand(attestationsCommand);
program.addCommand(healthCommand);
program.addCommand(ipfsCommand);
program.addCommand(localCommand);
program.addCommand(bundleCommand);
program.addCommand(configCommand);
program.addCommand(orgCommand);

// Global error handler
program.exitOverride();

try {
  program.parse();
} catch (err: unknown) {
  // Commander throws for --version, --help, and no-command help (exitCode 0) — ignore those
  if (err && typeof err === 'object' && 'exitCode' in err) {
    process.exit((err as { exitCode: number }).exitCode ?? 0);
  }
  if (err instanceof Error) {
    console.error(chalk.red('Error:'), err.message);
  } else {
    console.error(chalk.red('Unknown error occurred'));
  }
  process.exit(1);
}
