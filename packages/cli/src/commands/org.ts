/**
 * Organization commands: create, list, get, update, members, packages.
 * Write operations use X-Pubkey + X-Signature (signed request).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  loadKeypair,
  getSignedHeaders,
  publicKeyToBase58,
} from '../lib/signed-request.js';

const DEFAULT_URL = 'http://localhost:8082';
const DEFAULT_TIMEOUT = 10000;

function getGlobalOpts(command: Command): {
  url: string;
  timeout: number;
} {
  const opts = command.parent?.parent?.opts() ?? {};
  return {
    url: opts.url ?? DEFAULT_URL,
    timeout: parseInt(String(opts.timeout ?? DEFAULT_TIMEOUT), 10) || DEFAULT_TIMEOUT,
  };
}

function getKeypairPath(command: Command): string | undefined {
  const orgCmd =
    command.parent?.name() === 'org' ? command.parent : command.parent?.parent;
  return orgCmd?.opts()?.keypair;
}

async function fetchJson<T>(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<{ data: T; status: number }> {
  const { timeout = DEFAULT_TIMEOUT, ...init } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const res = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  });
  clearTimeout(id);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  return { data, status: res.status };
}

export const orgCommand = new Command('org')
  .description('Manage organizations (create, list, members, packages)')
  .option(
    '-k, --keypair <path>',
    'Path to Solana keypair JSON (64 bytes). Overrides CALIMERO_REGISTRY_KEYPAIR.'
  )
  .addCommand(
    new Command('list')
      .description('List organizations you belong to (uses keypair pubkey as member)')
      .action(async (_options, command: Command) => {
        const { url, timeout } = getGlobalOpts(command);
        const keypairPath = getKeypairPath(command);
        const spinner = ora('Loading keypair...').start();
        let pubkey: string;
        try {
          const kp = loadKeypair({ keypairPath });
          pubkey = publicKeyToBase58(kp.publicKey);
          spinner.text = 'Fetching organizations...';
        } catch (e) {
          spinner.fail('Keypair required');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }
        const base = url.replace(/\/$/, '');
        const apiUrl = `${base}/api/v2/orgs?member=${encodeURIComponent(pubkey)}`;
        try {
          const { data, status } = await fetchJson<Array<{ id: string; name: string; slug: string }>>(apiUrl, {
            method: 'GET',
            timeout,
          });
          if (status !== 200) {
            spinner.fail('Failed to list organizations');
            console.error(chalk.red(JSON.stringify(data)));
            process.exit(1);
          }
          spinner.succeed(`Found ${(data ?? []).length} organization(s)`);
          if (!Array.isArray(data) || data.length === 0) {
            console.log(chalk.yellow('No organizations found'));
            return;
          }
          console.log(
            (data as Array<{ id: string; name: string; slug: string }>)
              .map((o) => `${o.slug} (${o.name})`)
              .join('\n')
          );
        } catch (e) {
          spinner.fail('Request failed');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new organization')
      .requiredOption('-n, --name <name>', 'Organization display name')
      .requiredOption('-s, --slug <slug>', 'Organization slug (e.g. my-org)')
      .action(async (options: { name: string; slug: string }, command: Command) => {
        const { url, timeout } = getGlobalOpts(command);
        const keypairPath = getKeypairPath(command);
        const spinner = ora('Creating organization...').start();
        try {
          const kp = loadKeypair({ keypairPath });
          const pathname = '/api/v2/orgs';
          const body = { name: options.name.trim(), slug: options.slug.trim().toLowerCase() };
          const headers = await getSignedHeaders('POST', pathname, body, kp);
          const base = url.replace(/\/$/, '');
          const { data, status } = await fetchJson<{ id: string; name: string; slug: string } | { error: string; message: string }>(
            `${base}${pathname}`,
            {
              method: 'POST',
              body: JSON.stringify(body),
              timeout,
              headers: { ...headers },
            }
          );
          if (status >= 400) {
            const err = data as { error?: string; message?: string };
            spinner.fail(err?.message || `HTTP ${status}`);
            console.error(chalk.red(JSON.stringify(data)));
            process.exit(1);
          }
          spinner.succeed('Organization created');
          console.log(chalk.green(JSON.stringify(data, null, 2)));
        } catch (e) {
          spinner.fail('Failed');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get organization by id/slug')
      .argument('<orgId>', 'Organization id or slug')
      .action(async (orgId: string, _options, command: Command) => {
        const { url, timeout } = getGlobalOpts(command);
        const base = url.replace(/\/$/, '');
        const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}`;
        const spinner = ora('Fetching organization...').start();
        try {
          const { data, status } = await fetchJson<Record<string, unknown> | { error: string; message: string }>(
            `${base}${pathname}`,
            { method: 'GET', timeout }
          );
          if (status === 404) {
            spinner.fail('Organization not found');
            process.exit(1);
          }
          if (status !== 200) {
            spinner.fail('Request failed');
            console.error(chalk.red(JSON.stringify(data)));
            process.exit(1);
          }
          spinner.succeed('OK');
          console.log(JSON.stringify(data, null, 2));
        } catch (e) {
          spinner.fail('Request failed');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('update')
      .description('Update organization (name, metadata)')
      .argument('<orgId>', 'Organization id or slug')
      .option('-n, --name <name>', 'New display name')
      .option('-m, --metadata <json>', 'Metadata JSON object')
      .action(async (orgId: string, options: { name?: string; metadata?: string }, command: Command) => {
        const { url, timeout } = getGlobalOpts(command);
        const keypairPath = getKeypairPath(command);
        const spinner = ora('Updating organization...').start();
        try {
          const kp = loadKeypair({ keypairPath });
          const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}`;
          const body: Record<string, unknown> = {};
          if (options.name !== undefined) body.name = options.name;
          if (options.metadata !== undefined) {
            try {
              body.metadata = JSON.parse(options.metadata);
            } catch {
              spinner.fail('--metadata must be valid JSON');
              process.exit(1);
            }
          }
          const headers = await getSignedHeaders('PATCH', pathname, body, kp);
          const base = url.replace(/\/$/, '');
          const { data, status } = await fetchJson(
            `${base}${pathname}`,
            {
              method: 'PATCH',
              body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
              timeout,
              headers: { ...headers },
            }
          );
          if (status >= 400) {
            spinner.fail((data as { message?: string })?.message || `HTTP ${status}`);
            console.error(chalk.red(JSON.stringify(data)));
            process.exit(1);
          }
          spinner.succeed('Updated');
          console.log(JSON.stringify(data, null, 2));
        } catch (e) {
          spinner.fail('Failed');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('members')
      .description('List, add, or remove organization members')
      .argument('<orgId>', 'Organization id or slug')
      .addCommand(
        new Command('list')
          .description('List members')
          .action(async (_options, command: Command) => {
            const orgId = (command.parent as Command).args[0] as string;
            const { url, timeout } = getGlobalOpts(command);
            const base = url.replace(/\/$/, '');
            const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members`;
            const spinner = ora('Fetching members...').start();
            try {
              const { data, status } = await fetchJson<{ members: Array<{ pubkey: string; role: string }> }>(
                `${base}${pathname}`,
                { method: 'GET', timeout }
              );
              if (status !== 200) {
                spinner.fail('Failed');
                console.error(chalk.red(JSON.stringify(data)));
                process.exit(1);
              }
              spinner.succeed('OK');
              const members = (data as { members?: Array<{ pubkey: string; role: string }> })?.members ?? [];
              console.log(JSON.stringify(members, null, 2));
            } catch (e) {
              spinner.fail('Request failed');
              console.error(chalk.red(e instanceof Error ? e.message : String(e)));
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('add')
          .description('Add a member by pubkey')
          .argument('<pubkey>', 'Member public key (base58)')
          .option('-r, --role <role>', 'Role: member or admin', 'member')
          .action(async (pubkey: string, options: { role: string }, command: Command) => {
            const orgId = (command.parent as Command).args[0] as string;
            const { url, timeout } = getGlobalOpts(command);
            const keypairPath = getKeypairPath(command);
            const spinner = ora('Adding member...').start();
            try {
              const kp = loadKeypair({ keypairPath });
              const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members`;
              const body = { pubkey: pubkey.trim(), role: options.role === 'admin' ? 'admin' : 'member' };
              const headers = await getSignedHeaders('POST', pathname, body, kp);
              const base = url.replace(/\/$/, '');
              const { data, status } = await fetchJson(
                `${base}${pathname}`,
                {
                  method: 'POST',
                  body: JSON.stringify(body),
                  timeout,
                  headers: { ...headers },
                }
              );
              if (status >= 400) {
                spinner.fail((data as { message?: string })?.message || `HTTP ${status}`);
                console.error(chalk.red(JSON.stringify(data)));
                process.exit(1);
              }
              spinner.succeed('Member added');
            } catch (e) {
              spinner.fail('Failed');
              console.error(chalk.red(e instanceof Error ? e.message : String(e)));
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('remove')
          .description('Remove a member by pubkey')
          .argument('<pubkey>', 'Member public key (base58)')
          .action(async (pubkey: string, _options, command: Command) => {
            const orgId = (command.parent as Command).args[0] as string;
            const { url, timeout } = getGlobalOpts(command);
            const keypairPath = getKeypairPath(command);
            const spinner = ora('Removing member...').start();
            try {
              const kp = loadKeypair({ keypairPath });
              const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(pubkey.trim())}`;
              const headers = await getSignedHeaders('DELETE', pathname, undefined, kp);
              const base = url.replace(/\/$/, '');
              const { data, status } = await fetchJson(`${base}${pathname}`, {
                method: 'DELETE',
                timeout,
                headers: { ...headers },
              });
              if (status >= 400) {
                spinner.fail((data as { message?: string })?.message || `HTTP ${status}`);
                console.error(chalk.red(JSON.stringify(data)));
                process.exit(1);
              }
              spinner.succeed('Member removed');
            } catch (e) {
              spinner.fail('Failed');
              console.error(chalk.red(e instanceof Error ? e.message : String(e)));
              process.exit(1);
            }
          })
      )
  )
  .addCommand(
    new Command('packages')
      .description('Link or unlink packages to the organization')
      .argument('<orgId>', 'Organization id or slug')
      .addCommand(
        new Command('link')
          .description('Link a package name to the organization')
          .argument('<package>', 'Package name')
          .action(async (pkg: string, _options, command: Command) => {
            const orgId = (command.parent as Command).args[0] as string;
            const { url, timeout } = getGlobalOpts(command);
            const keypairPath = getKeypairPath(command);
            const spinner = ora('Linking package...').start();
            try {
              const kp = loadKeypair({ keypairPath });
              const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/packages`;
              const body = { package: pkg.trim() };
              const headers = await getSignedHeaders('POST', pathname, body, kp);
              const base = url.replace(/\/$/, '');
              const { data, status } = await fetchJson(
                `${base}${pathname}`,
                {
                  method: 'POST',
                  body: JSON.stringify(body),
                  timeout,
                  headers: { ...headers },
                }
              );
              if (status >= 400) {
                spinner.fail((data as { message?: string })?.message || `HTTP ${status}`);
                console.error(chalk.red(JSON.stringify(data)));
                process.exit(1);
              }
              spinner.succeed('Package linked');
            } catch (e) {
              spinner.fail('Failed');
              console.error(chalk.red(e instanceof Error ? e.message : String(e)));
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('unlink')
          .description('Unlink a package from the organization')
          .argument('<package>', 'Package name')
          .action(async (pkg: string, _options, command: Command) => {
            const orgId = (command.parent as Command).args[0] as string;
            const { url, timeout } = getGlobalOpts(command);
            const keypairPath = getKeypairPath(command);
            const spinner = ora('Unlinking package...').start();
            try {
              const kp = loadKeypair({ keypairPath });
              const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/packages/${encodeURIComponent(pkg.trim())}`;
              const headers = await getSignedHeaders('DELETE', pathname, undefined, kp);
              const base = url.replace(/\/$/, '');
              const { data, status } = await fetchJson(`${base}${pathname}`, {
                method: 'DELETE',
                timeout,
                headers: { ...headers },
              });
              if (status >= 400) {
                spinner.fail((data as { message?: string })?.message || `HTTP ${status}`);
                console.error(chalk.red(JSON.stringify(data)));
                process.exit(1);
              }
              spinner.succeed('Package unlinked');
            } catch (e) {
              spinner.fail('Failed');
              console.error(chalk.red(e instanceof Error ? e.message : String(e)));
              process.exit(1);
            }
          })
      )
  );
