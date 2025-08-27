import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { SSAppRegistryClient } from '@calimero-network/registry-client';

export const attestationsCommand = new Command('attestations')
  .description('Manage application attestations')
  .addCommand(
    new Command('get')
      .description('Get attestation for a specific application version')
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
          `Fetching attestation for ${name}@${version}...`
        ).start();

        try {
          const attestation = await client.getAttestation(
            pubkey,
            name,
            version
          );

          spinner.succeed('Attestation fetched successfully');

          console.log(chalk.blue('\nAttestation:'));
          console.log(chalk.green('Status:'), attestation.status);
          console.log(chalk.green('Timestamp:'), attestation.timestamp);
          if (attestation.comment) {
            console.log(chalk.green('Comment:'), attestation.comment);
          }
        } catch (error) {
          spinner.fail('Failed to fetch attestation');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  );
