import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { RemoteConfig } from '../lib/remote-config.js';
import { LocalConfig } from '../lib/local-config.js';

export const healthCommand = new Command('health')
  .description('Check the health of the Calimero Registry API')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts();

    // The two registries expose health at different paths: the local server
    // owns its whole origin and serves /healthz, while on the deployed
    // registry that path belongs to the frontend.
    let url: string;
    if (globalOpts?.local) {
      const local = new LocalConfig();
      url = `http://${local.getHost()}:${local.getPort()}/healthz`;
    } else {
      // getRegistryUrl already falls through the env var to the public
      // registry, so repeating that default here would only give it a second
      // place to drift from.
      const base = (globalOpts?.url || new RemoteConfig().getRegistryUrl())
        .trim()
        .replace(/\/$/, '');
      url = `${base}/api/healthz`;
    }

    const spinner = ora('Checking API health...').start();

    try {
      // Accept only a JSON body that says ok. Asking the deployed registry for
      // /healthz used to reach the frontend, and any 200 from the app shell
      // read as healthy against an API that was never contacted.
      const { data } = await axios.get(url, {
        timeout: parseInt(globalOpts?.timeout || '10000'),
        headers: { Accept: 'application/json' },
      });

      if (data?.status !== 'ok') {
        throw new Error(
          `unexpected response from ${url}: ${JSON.stringify(data)}`
        );
      }

      spinner.succeed('API is healthy');
      console.log(chalk.green(`Status: ${data.status}`));
      if (data.timestamp) {
        console.log(chalk.gray(`Checked: ${data.timestamp}`));
      }
    } catch (error) {
      spinner.fail('API health check failed');
      // A refused connection arrives with an empty message, which on its own
      // says nothing about what was tried; the url is the useful part.
      const reason =
        (error instanceof Error && error.message) ||
        (axios.isAxiosError(error) && error.code) ||
        'no response';
      console.error(chalk.red(`Error: ${reason}`));
      console.error(chalk.gray(`Tried: ${url}`));
      if (globalOpts?.local) {
        console.error(
          chalk.gray('Is it running? "calimero-registry local start"')
        );
      }
      process.exit(1);
    }
  });
