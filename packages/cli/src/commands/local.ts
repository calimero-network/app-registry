import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { LocalRegistryServer } from '../lib/local-server.js';
import { LocalConfig } from '../lib/local-config.js';
import fs from 'fs';

const localCommand = new Command('local').description(
  'Manage local registry for development'
);

// Start local registry
localCommand.addCommand(
  new Command('start')
    .description('Start local registry server')
    .option('-p, --port <port>', 'Port to run the server on', '8082')
    .option('-h, --host <host>', 'Host to bind the server to', 'localhost')
    .action(async options => {
      const spinner = ora('Starting local registry...').start();

      try {
        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        await server.start(parseInt(options.port));

        spinner.succeed(
          `Local registry started on http://${options.host}:${options.port}`
        );
        console.log(chalk.blue('\n📱 Local Registry Status:'));
        console.log(
          chalk.green(`✅ Server: http://${options.host}:${options.port}`)
        );
        console.log(chalk.green(`📁 Data: ${config.getDataDir()}`));
        console.log(
          chalk.green(
            `📋 Health: http://${options.host}:${options.port}/healthz`
          )
        );
        console.log(
          chalk.green(`📊 Stats: http://${options.host}:${options.port}/stats`)
        );
        console.log(
          chalk.blue(
            '\n💡 Use --local flag with other commands to use local registry'
          )
        );
      } catch (error) {
        spinner.fail('Failed to start local registry');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

// Stop local registry
localCommand.addCommand(
  new Command('stop')
    .description('Stop local registry server')
    .action(async () => {
      const spinner = ora('Stopping local registry...').start();

      try {
        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        await server.stop();

        spinner.succeed('Local registry stopped');
      } catch (error) {
        spinner.fail('Failed to stop local registry');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

// Status check
localCommand.addCommand(
  new Command('status')
    .description('Check local registry status')
    .action(async () => {
      const spinner = ora('Checking local registry status...').start();

      try {
        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        const status = await server.getStatus();

        if (status.running) {
          spinner.succeed('Local registry is running');
          console.log(chalk.green(`✅ Server: ${status.url}`));
          console.log(chalk.green(`📁 Data: ${status.dataDir}`));
          console.log(chalk.green(`📊 Apps: ${status.appsCount} applications`));
          console.log(
            chalk.green(`📦 Artifacts: ${status.artifactsCount} artifacts`)
          );
        } else {
          spinner.warn('Local registry is not running');
          console.log(
            chalk.yellow(
              '💡 Run "calimero-registry local start" to start the local registry'
            )
          );
        }
      } catch (error) {
        spinner.fail('Failed to check local registry status');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

// Reset local data
localCommand.addCommand(
  new Command('reset')
    .description('Reset local registry data')
    .option('-f, --force', 'Force reset without confirmation')
    .action(async options => {
      if (!options.force) {
        console.log(
          chalk.yellow('⚠️  This will delete all local registry data!')
        );
        console.log(chalk.yellow('   Use --force flag to confirm'));
        return;
      }

      const spinner = ora('Resetting local registry data...').start();

      try {
        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        await server.reset();

        spinner.succeed('Local registry data reset');
        console.log(chalk.green('✅ All local data has been cleared'));
      } catch (error) {
        spinner.fail('Failed to reset local registry data');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

// Backup local data
localCommand.addCommand(
  new Command('backup')
    .description('Backup local registry data')
    .option('-o, --output <file>', 'Output file path')
    .action(async options => {
      const spinner = ora('Creating backup...').start();

      try {
        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        const backupPath = await server.backup(options.output);

        spinner.succeed('Backup created successfully');
        console.log(chalk.green(`📦 Backup saved to: ${backupPath}`));
      } catch (error) {
        spinner.fail('Failed to create backup');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

// Restore from backup
localCommand.addCommand(
  new Command('restore')
    .description('Restore local registry data from backup')
    .argument('<backup-file>', 'Path to backup file')
    .action(async backupFile => {
      const spinner = ora('Restoring from backup...').start();

      try {
        if (!fs.existsSync(backupFile)) {
          spinner.fail('Backup file not found');
          console.error(chalk.red(`File not found: ${backupFile}`));
          process.exit(1);
        }

        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        await server.restore(backupFile);

        spinner.succeed('Data restored successfully');
        console.log(chalk.green(`✅ Restored from: ${backupFile}`));
      } catch (error) {
        spinner.fail('Failed to restore from backup');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

// Seed with sample data
localCommand.addCommand(
  new Command('seed')
    .description('Seed local registry with sample data')
    .action(async () => {
      const spinner = ora('Seeding local registry with sample data...').start();

      try {
        const config = new LocalConfig();
        const server = new LocalRegistryServer(config);

        await server.seed();

        spinner.succeed('Sample data seeded successfully');
        console.log(
          chalk.green('✅ Local registry populated with sample applications')
        );
        console.log(
          chalk.blue(
            '💡 Run "calimero-registry apps list --local" to see the sample apps'
          )
        );
      } catch (error) {
        spinner.fail('Failed to seed sample data');
        if (error instanceof Error) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        process.exit(1);
      }
    })
);

export { localCommand };
