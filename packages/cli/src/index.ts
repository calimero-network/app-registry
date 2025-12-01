import { Command } from 'commander';
import chalk from 'chalk';
import { appsCommand } from './commands/apps.js';
import { developersCommand } from './commands/developers.js';
import { attestationsCommand } from './commands/attestations.js';
import { healthCommand } from './commands/health.js';
import { ipfsCommand } from './commands/ipfs.js';
import { localCommand } from './commands/local.js';
import { v1Command } from './commands/v1.js';
import { bundleCommand } from './commands/bundle.js';

const program = new Command();

program
  .name('calimero-registry')
  .description(
    'Calimero Network App Registry CLI - Command-line interface for the App Registry'
  )
  .version('1.0.0');

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
program.addCommand(v1Command);
program.addCommand(bundleCommand);

// Global error handler
program.exitOverride();

try {
  program.parse();
} catch (err) {
  if (err instanceof Error) {
    console.error(chalk.red('Error:'), err.message);
  } else {
    console.error(chalk.red('Unknown error occurred'));
  }
  process.exit(1);
}
