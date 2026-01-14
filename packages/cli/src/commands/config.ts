import { Command } from 'commander';
import chalk from 'chalk';
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
    .argument('<value>', 'Configuration value')
    .action((key, value) => {
      try {
        const config = new RemoteConfig();

        switch (key) {
          case 'registry-url':
          case 'registryUrl':
          case 'url':
            config.setRegistryUrl(value);
            console.log(
              chalk.green(`✅ Registry URL set to: ${chalk.bold(value)}`)
            );
            break;

          case 'api-key':
          case 'apiKey':
            config.setApiKey(value);
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

        // Registry URL
        const url = config.getRegistryUrl();
        const urlSource = process.env.CALIMERO_REGISTRY_URL
          ? chalk.yellow('(from CALIMERO_REGISTRY_URL env var)')
          : chalk.gray('(from config file)');
        console.log(`  ${chalk.bold('Registry URL:')} ${url} ${urlSource}`);

        // API Key
        const apiKey = config.getApiKey();
        if (apiKey) {
          const apiKeySource = process.env.CALIMERO_API_KEY
            ? chalk.yellow('(from CALIMERO_API_KEY env var)')
            : chalk.gray('(from config file)');
          const masked =
            apiKey.length > 8
              ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
              : '***';
          console.log(`  ${chalk.bold('API Key:')} ${masked} ${apiKeySource}`);
        } else {
          console.log(`  ${chalk.bold('API Key:')} ${chalk.gray('(not set)')}`);
        }

        console.log(
          chalk.blue(`\n📁 Config file: ${config.getConfigPath()}\n`)
        );
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
