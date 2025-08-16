import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { SSAppRegistryClient } from '@ssapp-registry/client';

export const developersCommand = new Command('developers')
  .description('Manage developer profiles')
  .addCommand(
    new Command('get')
      .description('Get developer profile information')
      .argument('<pubkey>', 'Developer public key')
      .action(async (pubkey, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const client = new SSAppRegistryClient({
          baseURL: globalOpts?.url || 'http://localhost:8082',
          timeout: parseInt(globalOpts?.timeout || '10000'),
        });

        const spinner = ora('Fetching developer profile...').start();

        try {
          const profile = await client.getDeveloper(pubkey);

          spinner.succeed('Developer profile fetched successfully');

          console.log(chalk.blue('\nDeveloper Profile:'));
          console.log(chalk.green('Display Name:'), profile.display_name);
          if (profile.website) {
            console.log(chalk.green('Website:'), profile.website);
          }

          if (profile.proofs.length > 0) {
            console.log(chalk.green('\nProofs:'));
            const tableData = [
              ['Type', 'Value', 'Verified'],
              ...profile.proofs.map(proof => [
                proof.type,
                proof.value.substring(0, 20) + '...',
                proof.verified ? chalk.green('Yes') : chalk.red('No'),
              ]),
            ];
            console.log(table(tableData));
          } else {
            console.log(chalk.yellow('\nNo proofs found'));
          }
        } catch (error) {
          spinner.fail('Failed to fetch developer profile');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new developer profile')
      .argument('<pubkey>', 'Developer public key')
      .argument('<display-name>', 'Display name for the developer')
      .option('-w, --website <url>', 'Developer website URL')
      .option('-p, --proofs <proofs>', 'JSON string of proofs array')
      .action(async (pubkey, displayName, options, command) => {
        const globalOpts = command.parent?.parent?.opts();
        const client = new SSAppRegistryClient({
          baseURL: globalOpts?.url || 'http://localhost:8082',
          timeout: parseInt(globalOpts?.timeout || '10000'),
        });

        const spinner = ora('Creating developer profile...').start();

        try {
          let proofs = [];
          if (options.proofs) {
            try {
              proofs = JSON.parse(options.proofs);
            } catch {
              spinner.fail('Invalid proofs JSON format');
              console.error(chalk.red('Proofs must be a valid JSON array'));
              process.exit(1);
            }
          }

          const profile = {
            pubkey,
            display_name: displayName,
            website: options.website,
            proofs,
          };

          const result = await client.submitDeveloperProfile(pubkey, profile);

          spinner.succeed('Developer profile created successfully');
          console.log(chalk.green(`\n✅ ${result.message}`));
          console.log(chalk.blue(`\n👤 Developer: ${displayName}`));
          console.log(chalk.blue(`🔑 Public Key: ${pubkey}`));
          if (options.website) {
            console.log(chalk.blue(`🌐 Website: ${options.website}`));
          }
        } catch (error) {
          spinner.fail('Failed to create developer profile');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  );
