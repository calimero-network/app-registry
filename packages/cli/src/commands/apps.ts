import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { SSAppRegistryClient } from '@ssapp-registry/client';

export const appsCommand = new Command('apps')
  .description('Manage SSApp applications')
  .addCommand(
    new Command('list')
      .description('List all applications')
      .option('-d, --dev <pubkey>', 'Filter by developer public key')
      .option('-n, --name <name>', 'Filter by application name')
      .action(async (options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const client = new SSAppRegistryClient({
          baseURL: globalOpts?.url || 'http://localhost:8082',
          timeout: parseInt(globalOpts?.timeout || '10000'),
        });

        const spinner = ora('Fetching applications...').start();

        try {
          const apps = await client.getApps({
            dev: options.dev,
            name: options.name,
          });

          spinner.succeed(`Found ${apps.length} application(s)`);

          if (apps.length === 0) {
            console.log(chalk.yellow('No applications found'));
            return;
          }

          const tableData = [
            ['Name', 'Developer', 'Latest Version', 'Latest CID', 'Alias'],
            ...apps.map(app => [
              app.name,
              app.developer_pubkey?.substring(0, 12) + '...' || 'Unknown',
              app.latest_version || 'Unknown',
              app.latest_cid?.substring(0, 12) + '...' || 'N/A',
              app.alias || '-',
            ]),
          ];

          console.log(table(tableData));
        } catch (error) {
          spinner.fail('Failed to fetch applications');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('versions')
      .description('List versions of a specific application')
      .argument('<pubkey>', 'Developer public key')
      .argument('<name>', 'Application name')
      .action(async (pubkey, name, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const client = new SSAppRegistryClient({
          baseURL: globalOpts?.url || 'http://localhost:8082',
          timeout: parseInt(globalOpts?.timeout || '10000'),
        });

        const spinner = ora(`Fetching versions for ${name}...`).start();

        try {
          const versions = await client.getAppVersions(pubkey, name);

          spinner.succeed(`Found ${versions.length} version(s)`);

          if (versions.length === 0) {
            console.log(chalk.yellow('No versions found'));
            return;
          }

          const tableData = [
            ['Version', 'CID', 'Yanked'],
            ...versions.map(version => [
              version.semver,
              version.cid.substring(0, 12) + '...',
              version.yanked ? chalk.red('Yes') : chalk.green('No'),
            ]),
          ];

          console.log(table(tableData));
        } catch (error) {
          spinner.fail('Failed to fetch versions');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('manifest')
      .description('Get manifest for a specific application version')
      .argument('<pubkey>', 'Developer public key')
      .argument('<name>', 'Application name')
      .argument('<version>', 'Application version')
      .action(async (pubkey, name, version, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const client = new SSAppRegistryClient({
          baseURL: globalOpts?.url || 'http://localhost:8082',
          timeout: parseInt(globalOpts?.timeout || '10000'),
        });

        const spinner = ora(
          `Fetching manifest for ${name}@${version}...`
        ).start();

        try {
          const manifest = await client.getAppManifest(pubkey, name, version);

          spinner.succeed('Manifest fetched successfully');

          console.log(chalk.blue('\nApplication Manifest:'));
          console.log(JSON.stringify(manifest, null, 2));
        } catch (error) {
          spinner.fail('Failed to fetch manifest');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  );
