import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { createRegistryClient } from '../lib/registry-client.js';
import fs from 'fs';
import path from 'path';

export const appsCommand = new Command('apps')
  .description('Manage SSApp applications')
  .addCommand(
    new Command('list')
      .description('List all applications')
      .option('-n, --name <name>', 'Filter by application name')
      .action(async (options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const useLocal = globalOpts?.local || false;
        const client = createRegistryClient(
          useLocal,
          globalOpts?.url,
          parseInt(globalOpts?.timeout || '10000')
        );

        const spinner = ora('Fetching applications...').start();

        try {
          const apps = await client.getApps({
            name: options.name,
          });

          spinner.succeed(`Found ${apps.length} application(s)`);

          if (apps.length === 0) {
            console.log(chalk.yellow('No applications found'));
            return;
          }

          const tableData = [
            ['ID', 'Name', 'Latest Version', 'Digest'],
            ...apps.map(app => [
              app.id,
              app.name,
              app.latest_version,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (app.latest_digest || (app as any).latest_cid || 'N/A')
                .toString()
                .substring(0, 12) + '...',
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
      .argument('<appId>', 'Application ID')
      .action(async (appId, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const useLocal = globalOpts?.local || false;
        const client = createRegistryClient(
          useLocal,
          globalOpts?.url,
          parseInt(globalOpts?.timeout || '10000')
        );

        const spinner = ora(`Fetching versions for ${appId}...`).start();

        try {
          const versions = await client.getAppVersions(appId);

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
      .argument('<appId>', 'Application ID')
      .argument('<version>', 'Application version')
      .action(async (appId, version, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const useLocal = globalOpts?.local || false;
        const client = createRegistryClient(
          useLocal,
          globalOpts?.url,
          parseInt(globalOpts?.timeout || '10000')
        );

        const spinner = ora(
          `Fetching manifest for ${appId}@${version}...`
        ).start();

        try {
          const manifest = await client.getAppManifest(appId, version);

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
  )
  .addCommand(
    new Command('submit')
      .description('Submit a new application manifest')
      .argument('<manifest-file>', 'Path to the manifest JSON file')
      .action(async (manifestFile, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const useLocal = globalOpts?.local || false;
        const client = createRegistryClient(
          useLocal,
          globalOpts?.url,
          parseInt(globalOpts?.timeout || '10000')
        );

        const spinner = ora('Reading manifest file...').start();

        try {
          // Read and parse the manifest file
          const manifestPath = path.resolve(manifestFile);
          if (!fs.existsSync(manifestPath)) {
            spinner.fail('Manifest file not found');
            console.error(chalk.red(`File not found: ${manifestFile}`));
            process.exit(1);
          }

          const manifestContent = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestContent);

          spinner.text = 'Submitting application manifest...';

          const result = await client.submitAppManifest(manifest);

          spinner.succeed('Application submitted successfully');
          console.log(chalk.green(`\n✅ ${result.message}`));

          if (manifest.app?.name) {
            console.log(chalk.blue(`\n📱 App: ${manifest.app.name}`));
            console.log(
              chalk.blue(`👤 Developer: ${manifest.app.developer_pubkey}`)
            );
            console.log(chalk.blue(`📦 Version: ${manifest.version?.semver}`));
          }
        } catch (error) {
          spinner.fail('Failed to submit application');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  );
