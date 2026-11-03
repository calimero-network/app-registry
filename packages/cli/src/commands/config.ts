import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { RemoteConfig } from '../lib/remote-config.js';

export const configCommand = new Command('config')
  .description('Manage CLI configuration for remote registry')
  .addCommand(createConfigSetCommand())
  .addCommand(createConfigGetCommand())
  .addCommand(createConfigListCommand())
  .addCommand(createConfigResetCommand());

function createConfigSetCommand(): Command {
  return new Command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (registry-url, api-key)')
    .argument(
      '[value]',
      'Configuration value; for api-key, omit it to read the key from stdin'
    )
    .action(async (key, value) => {
      try {
        const config = new RemoteConfig();

        switch (key) {
          case 'registry-url':
          case 'registryUrl':
          case 'url':
            if (!value) throw new Error('registry-url needs a value');
            config.setRegistryUrl(value);
            console.log(
              chalk.green(`✅ Registry URL set to: ${chalk.bold(value)}`)
            );
            break;

          case 'api-key':
          case 'apiKey':
            config.setApiKey(value ?? (await readApiKey()));
            console.log(chalk.green('✅ API key set successfully'));
            console.log(
              chalk.yellow(
                '💡 Note: API key is stored in plain text. Consider using CALIMERO_API_KEY environment variable for better security.'
              )
            );
            break;

          default:
            console.error(chalk.red(`❌ Unknown configuration key: ${key}`));
            console.log(chalk.blue('\nAvailable keys:'));
            console.log('  registry-url  - Default registry URL');
            console.log('  api-key       - API key for authentication');
            process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Failed to set configuration:'), message);
        process.exit(1);
      }
    });
}

// A key passed as an argument lands in shell history and the process list.
async function readApiKey(): Promise<string> {
  if (process.stdin.isTTY) process.stderr.write('Paste the API key: ');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (process.stdin.isTTY && input.includes('\n')) break;
  }
  const key = input.trim();
  if (!key) throw new Error('No API key on stdin');
  return key;
}

function createConfigGetCommand(): Command {
  return new Command('get')
    .description('Get a configuration value')
    .argument('<key>', 'Configuration key (registry-url, api-key)')
    .action(key => {
      try {
        const config = new RemoteConfig();

        switch (key) {
          case 'registry-url':
          case 'registryUrl':
          case 'url':
            console.log(config.getRegistryUrl());
            break;

          case 'api-key':
          case 'apiKey': {
            const apiKey = config.getApiKey();
            if (apiKey) {
              // Mask API key for security
              const masked =
                apiKey.length > 8
                  ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
                  : '***';
              console.log(masked);
              console.log(
                chalk.yellow(
                  '💡 Note: API key is masked. Use "config list" to see source.'
                )
              );
            } else {
              console.log('(not set)');
            }
            break;
          }

          default:
            console.error(chalk.red(`❌ Unknown configuration key: ${key}`));
            console.log(chalk.blue('\nAvailable keys:'));
            console.log('  registry-url  - Default registry URL');
            console.log('  api-key       - API key for authentication');
            process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Failed to get configuration:'), message);
        process.exit(1);
      }
    });
}

function createConfigListCommand(): Command {
  return new Command('list')
    .description('List all configuration values')
    .alias('ls')
    .action(() => {
      try {
        const config = new RemoteConfig();

        console.log(chalk.blue('\n📋 Remote Registry Configuration\n'));

        // Check if config file exists
        const configPath = config.getConfigPath();
        const configFileExists = fs.existsSync(configPath);

        // Registry URL
        const url = config.getRegistryUrl();
        let urlSource: string;
        if (process.env.CALIMERO_REGISTRY_URL) {
          urlSource = chalk.yellow('(from CALIMERO_REGISTRY_URL env var)');
        } else if (configFileExists) {
          urlSource = chalk.gray('(from config file)');
        } else {
          urlSource = chalk.gray('(default)');
        }
        console.log(`  ${chalk.bold('Registry URL:')} ${url} ${urlSource}`);

        // API Key
        const apiKey = config.getApiKey();
        if (apiKey) {
          let apiKeySource: string;
          if (process.env.CALIMERO_API_KEY) {
            apiKeySource = chalk.yellow('(from CALIMERO_API_KEY env var)');
          } else if (configFileExists) {
            apiKeySource = chalk.gray('(from config file)');
          } else {
            apiKeySource = chalk.gray('(default)');
          }
          const masked =
            apiKey.length > 8
              ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
              : '***';
          console.log(`  ${chalk.bold('API Key:')} ${masked} ${apiKeySource}`);
        } else {
          console.log(`  ${chalk.bold('API Key:')} ${chalk.gray('(not set)')}`);
        }

        console.log(chalk.blue(`\n📁 Config file: ${configPath}`));
        if (!configFileExists) {
          console.log(chalk.gray('   (file does not exist, using defaults)'));
        }
        console.log();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Failed to list configuration:'), message);
        process.exit(1);
      }
    });
}

function createConfigResetCommand(): Command {
  return new Command('reset')
    .description('Reset configuration to defaults')
    .option('--force', 'Skip confirmation prompt')
    .action(options => {
      try {
        if (!options.force) {
          console.error(
            chalk.red('❌ Configuration reset requires --force flag')
          );
          console.log(
            chalk.yellow(
              '⚠️  This will reset all configuration to defaults. Use --force to confirm.'
            )
          );
          process.exit(1);
        }

        const config = new RemoteConfig();
        config.reset();

        console.log(chalk.green('✅ Configuration reset to defaults'));
        console.log(chalk.blue('\nDefault values:'));
        console.log('  Registry URL: https://apps.calimero.network');
        console.log('  API Key: (not set)');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('❌ Failed to reset configuration:'), message);
        process.exit(1);
      }
    });
}
