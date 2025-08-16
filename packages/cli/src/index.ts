#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { appsCommand } from './commands/apps.js';
import { developersCommand } from './commands/developers.js';
import { attestationsCommand } from './commands/attestations.js';
import { healthCommand } from './commands/health.js';

const program = new Command();

program
  .name('ssapp-registry')
  .description(
    'SSApp Registry CLI - Command-line interface for the SSApp Registry'
  )
  .version('1.0.0');

// Global options
program.option('-u, --url <url>', 'Registry API URL', 'http://localhost:8082');
program.option(
  '-t, --timeout <timeout>',
  'Request timeout in milliseconds',
  '10000'
);

// Add commands
program.addCommand(appsCommand);
program.addCommand(developersCommand);
program.addCommand(attestationsCommand);
program.addCommand(healthCommand);

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
