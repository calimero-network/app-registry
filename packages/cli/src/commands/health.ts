import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { SSAppRegistryClient } from '@calimero-network/registry-client';

export const healthCommand = new Command('health')
  .description('Check the health of the SSApp Registry API')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts();
    const client = new SSAppRegistryClient({
      baseURL: globalOpts?.url || 'http://localhost:8082',
      timeout: parseInt(globalOpts?.timeout || '10000'),
    });

    const spinner = ora('Checking API health...').start();

    try {
      const health = await client.healthCheck();
      spinner.succeed('API is healthy');
      console.log(chalk.green(`Status: ${health.status}`));
    } catch (error) {
      spinner.fail('API health check failed');
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });
