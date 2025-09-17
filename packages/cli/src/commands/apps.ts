import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import fs from 'fs';
import axios from 'axios';
import {
  ensureValidCertificate,
  createClientWithCertificate,
} from '../lib/certificate.js';

export const appsCommand = new Command('apps')
  .description('Manage SSApp applications')
  .addCommand(
    new Command('list')
      .description('List all applications')
      .option('-d, --dev <pubkey>', 'Filter by developer public key')
      .option('-n, --name <name>', 'Filter by application name')
      .action(async (options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        try {
          // Automatically ensure valid certificate
          await ensureValidCertificate(
            globalOpts?.url || 'http://localhost:8082'
          );

          const client = createClientWithCertificate(
            globalOpts?.url || 'http://localhost:8082'
          );
          console.log('📱 Applications:');
          console.log(
            'Certificate automatically loaded:',
            client.certificate?.certificate_id || 'None'
          );
          console.log('Headers:', client.headers);
          // In real implementation, this would call the actual API
          console.log('Mock: Would list applications from registry');
        } catch (error) {
          console.error(
            '❌ Error:',
            error instanceof Error ? error.message : 'Unknown error'
          );
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
        const client = createClientWithCertificate(globalOpts?.url);

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
        const client = createClientWithCertificate(globalOpts?.url);

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
  )
  .addCommand(
    new Command('publish')
      .description('Publish a new application (upload WASM + create manifest)')
      .requiredOption('-w, --wasm <file>', 'Path to the WASM file')
      .requiredOption('-n, --name <name>', 'Application name')
      .requiredOption('--app-version <version>', 'Application version (semver)')
      .option('-a, --alias <alias>', 'Application alias (optional)')
      .option('-d, --description <desc>', 'Application description')
      .option('-u, --author <author>', 'Application author')
      .option('-l, --license <license>', 'Application license', 'MIT')
      .option(
        '--chains <chains>',
        'Supported chains (comma-separated)',
        'calimero'
      )
      .action(async (options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const spinner = ora('Publishing application...').start();

        try {
          // 1. Ensure valid certificate
          spinner.text = 'Validating certificate...';
          const cert = await ensureValidCertificate(
            globalOpts?.url || 'http://localhost:8082'
          );

          // 2. Prepare WASM file for upload
          spinner.text = 'Preparing WASM file...';
          if (!fs.existsSync(options.wasm)) {
            throw new Error(`WASM file not found: ${options.wasm}`);
          }

          const fileStats = fs.statSync(options.wasm);
          const fileSize = fileStats.size;

          spinner.text = `Uploading ${(fileSize / 1024).toFixed(1)}KB WASM file...`;

          // 3. Read WASM file and encode as base64 (reliable approach)
          const wasmBuffer = fs.readFileSync(options.wasm);
          const wasmBase64 = wasmBuffer.toString('base64');

          // 4. Create JSON payload
          const payload = {
            name: options.name,
            version: options.appVersion,
            description: options.description || `${options.name} application`,
            author: options.author || 'Unknown',
            license: options.license,
            chains: options.chains,
            wasm_content: wasmBase64,
          };

          if (options.alias) {
            payload.alias = options.alias;
          }

          // 5. Submit to registry using JSON upload
          spinner.text = 'Publishing to registry...';
          const registryUrl = globalOpts?.url || 'http://localhost:8082';

          const response = await axios.post(
            `${registryUrl}/apps/upload`,
            payload,
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Developer-Pubkey': cert.developer_pubkey, // Authentication in header
                'X-Developer-Certificate': cert.certificate_id, // Certificate ID for logging
              },
            }
          );

          const result = response.data;

          spinner.succeed('Application published successfully!');

          console.log('\n📦 Publishing App:');
          console.log(`   Name: ${options.name}`);
          console.log(`   Version: ${options.appVersion}`);
          console.log(`   Size: ${(fileSize / 1024).toFixed(1)}KB`);
          console.log(`   Certificate: ${cert.certificate_id}`);
          console.log(`   Author: ${options.author || 'Unknown'}`);

          console.log(chalk.green('\n✅ Publication Summary:'));
          console.log(`   📱 App: ${options.name}@${options.appVersion}`);
          console.log(`   🔐 Certificate: ${cert.certificate_id}`);
          console.log(`   📦 WASM Size: ${(fileSize / 1024).toFixed(1)}KB`);
          console.log(`   🌐 Chains: ${options.chains}`);
          console.log(`   📄 License: ${options.license}`);
          console.log(`   ☁️ IPFS CID: ${result.ipfs_cid}`);

          console.log(chalk.blue('\n📋 Next Steps:'));
          console.log('   • Your app is now published in the registry');
          console.log('   • Users can install it using the app name');
          console.log(`   • View it at: ${registryUrl}/apps`);
        } catch (error) {
          spinner.fail('Publication failed');

          if (axios.isAxiosError(error)) {
            const errorMessage = error.response?.data?.error || error.message;
            console.error('❌ Error:', errorMessage);
            if (error.response?.data?.details) {
              console.error('   Details:', error.response.data.details);
            }
          } else {
            console.error(
              '❌ Error:',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }

          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('submit')
      .description('Submit a pre-made application manifest')
      .argument('<manifest-file>', 'Path to the manifest JSON file')
      .action(async (manifestFile, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        try {
          // Automatically ensure valid certificate
          const cert = await ensureValidCertificate(
            globalOpts?.url || 'http://localhost:8082'
          );

          const client = createClientWithCertificate(
            globalOpts?.url || 'http://localhost:8082'
          );
          console.log(
            '📤 Submitting application with certificate:',
            cert.certificate_id
          );
          console.log('Headers:', client.headers);
          // In real implementation, this would call the actual API
          console.log('Mock: Would submit application to registry');
        } catch (error) {
          console.error(
            '❌ Error:',
            error instanceof Error ? error.message : 'Unknown error'
          );
          process.exit(1);
        }
      })
  );
