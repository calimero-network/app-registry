/**
 * Organization commands: create, list, get, update, members, packages.
 * Write operations use Authorization: Bearer <api-token>.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { RemoteConfig } from '../lib/remote-config.js';

const DEFAULT_TIMEOUT = 10000;

function getGlobalOpts(command: Command): {
  url: string;
  timeout: number;
} {
  const opts = command.parent?.parent?.opts() ?? {};
  const remoteConfig = new RemoteConfig();
  const url =
    opts.url ||
    process.env.CALIMERO_REGISTRY_URL ||
    remoteConfig.getRegistryUrl();
  return {
    url,
    timeout:
      parseInt(String(opts.timeout ?? DEFAULT_TIMEOUT), 10) || DEFAULT_TIMEOUT,
  };
}

/** Returns the Authorization header for CLI write operations. Throws if no token configured. */
function getAuthHeaders(): Record<string, string> {
  const remoteConfig = new RemoteConfig();
  const apiKey = remoteConfig.getApiKey();
  if (!apiKey) {
    throw new Error(
      'API token required for org write operations.\n' +
        'Get a token from the Organizations page in the web UI, then run:\n' +
        '  calimero-registry config set api-key <token>'
    );
  }
  return { Authorization: `Bearer ${apiKey}` };
}

interface FetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<{ data: T; status: number }> {
  const { timeout = DEFAULT_TIMEOUT, ...init } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const res = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  clearTimeout(id);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  return { data, status: res.status };
}

export const orgCommand = new Command('org')
  .description('Manage organizations (create, list, members, packages)')
  .addCommand(
    new Command('list')
      .description(
        'List organizations you belong to (uses API token to resolve identity)'
      )
      .action(async (_options, command: Command) => {
        const { url, timeout } = getGlobalOpts(command);
        const spinner = ora('Resolving identity...').start();
        let authHeaders: Record<string, string>;
        try {
          authHeaders = getAuthHeaders();
        } catch (e) {
          spinner.fail('API token required');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }

        const base = url.replace(/\/$/, '');

        // Resolve identity from API token via /api/auth/me (email + optional pubkey for org list)
        let myEmail: string;
        let memberParam: string;
        try {
          const { data, status } = await fetchJson<{
            user?: { email?: string; pubkey?: string | null };
          }>(`${base}/api/auth/me`, {
            method: 'GET',
            headers: authHeaders,
            timeout,
          });
          if (status !== 200 || !data?.user?.email) {
            spinner.fail('Could not resolve identity from API token');
            console.error(
              chalk.red(
                'Ensure your API token is valid. Get a new one from the web UI.'
              )
            );
            process.exit(1);
          }
          myEmail = data.user.email;
          // GET /api/v2/orgs expects member=pubkey; use pubkey when token has it, else email (API returns [] for email)
          memberParam =
            data.user.pubkey && data.user.pubkey.trim()
              ? data.user.pubkey.trim()
              : myEmail;
          spinner.text = `Fetching organizations for ${myEmail}...`;
        } catch (e) {
          spinner.fail('Request failed');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }

        const apiUrl = `${base}/api/v2/orgs?member=${encodeURIComponent(memberParam)}`;
        try {
          const { data, status } = await fetchJson<
            Array<{ id: string; name: string; slug: string }>
          >(apiUrl, {
            method: 'GET',
            headers: authHeaders,
            timeout,
          });
          if (status !== 200) {
            spinner.fail('Failed to list organizations');
            console.error(chalk.red(JSON.stringify(data)));
            process.exit(1);
          }
          const orgs = Array.isArray(data)
            ? (data as Array<{ id: string; name: string; slug: string }>)
            : [];
          spinner.succeed(`Found ${orgs.length} organization(s)`);
          if (orgs.length === 0) {
            console.log(chalk.yellow('No organizations found'));
            return;
          }
          // Fetch members for each org in parallel to show count + role
          const memberResults = await Promise.all(
            orgs.map(o =>
              fetchJson<{ members: Array<{ email: string; role: string }> }>(
                `${base}/api/v2/orgs/${encodeURIComponent(o.id)}/members`,
                { method: 'GET', headers: authHeaders, timeout }
              ).catch(() => ({ data: { members: [] }, status: 0 }))
            )
          );
          const lines = orgs.map((o, i) => {
            const members = memberResults[i].data?.members ?? [];
            const myMember = members.find(m => m.email === myEmail);
            const role = myMember?.role ?? '?';
            const count = members.length;
            const roleLabel =
              role === 'admin' ? chalk.yellow('admin') : chalk.gray(role);
            return `${chalk.white(o.slug)}  ${chalk.gray(o.name)}  ${chalk.gray(`${count} member${count !== 1 ? 's' : ''}`)}  ${roleLabel}`;
          });
          console.log(lines.join('\n'));
        } catch (e) {
          spinner.fail('Request failed');
          console.error(chalk.red(e instanceof Error ? e.message : String(e)));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new organization (requires API token)')
      .requiredOption('-n, --name <name>', 'Organization display name')
      .requiredOption('-s, --slug <slug>', 'Organization slug (e.g. my-org)')
      .action(
        async (options: { name: string; slug: string }, command: Command) => {
          const { url, timeout } = getGlobalOpts(command);
          const spinner = ora('Creating organization...').start();
          try {
            const authHeaders = getAuthHeaders();
            const pathname = '/api/v2/orgs';
            const body = {
              name: options.name.trim(),
              slug: options.slug.trim().toLowerCase(),
            };
            const base = url.replace(/\/$/, '');
            const { data, status } = await fetchJson<
              | { id: string; name: string; slug: string }
              | { error: string; message: string }
            >(`${base}${pathname}`, {
              method: 'POST',
              body: JSON.stringify(body),
              timeout,
              headers: authHeaders,
            });
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
            console.error(
              chalk.red(e instanceof Error ? e.message : String(e))
            );
            process.exit(1);
          }
        }
      )
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
          const { data, status } = await fetchJson<
            Record<string, unknown> | { error: string; message: string }
          >(`${base}${pathname}`, { method: 'GET', timeout });
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
      .action(
        async (
          orgId: string,
          options: { name?: string; metadata?: string },
          command: Command
        ) => {
          const { url, timeout } = getGlobalOpts(command);
          const spinner = ora('Updating organization...').start();
          try {
            const authHeaders = getAuthHeaders();
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
            const base = url.replace(/\/$/, '');
            const { data, status } = await fetchJson(`${base}${pathname}`, {
              method: 'PATCH',
              body:
                Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
              timeout,
              headers: authHeaders,
            });
            if (status >= 400) {
              spinner.fail(
                (data as { message?: string })?.message || `HTTP ${status}`
              );
              console.error(chalk.red(JSON.stringify(data)));
              process.exit(1);
            }
            spinner.succeed('Updated');
            console.log(JSON.stringify(data, null, 2));
          } catch (e) {
            spinner.fail('Failed');
            console.error(
              chalk.red(e instanceof Error ? e.message : String(e))
            );
            process.exit(1);
          }
        }
      )
  )
  .addCommand(
    new Command('delete')
      .description('Delete an organization and all its data (irreversible)')
      .argument('<orgId>', 'Organization id or slug')
      .option('-y, --yes', 'Skip confirmation prompt')
      .action(
        async (orgId: string, options: { yes?: boolean }, command: Command) => {
          const { url, timeout } = getGlobalOpts(command);
          if (!options.yes) {
            const { createInterface } = await import('readline');
            const rl = createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            const confirmed = await new Promise<boolean>(resolve => {
              rl.question(
                chalk.yellow(
                  `Delete organization "${orgId}" and all its members/packages? This cannot be undone. Type "yes" to confirm: `
                ),
                answer => {
                  rl.close();
                  resolve(answer.trim().toLowerCase() === 'yes');
                }
              );
            });
            if (!confirmed) {
              console.log(chalk.gray('Aborted.'));
              return;
            }
          }
          const spinner = ora('Deleting organization...').start();
          try {
            const authHeaders = getAuthHeaders();
            const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}`;
            const base = url.replace(/\/$/, '');
            const { data, status } = await fetchJson(`${base}${pathname}`, {
              method: 'DELETE',
              timeout,
              headers: authHeaders,
            });
            if (status >= 400) {
              spinner.fail(
                (data as { message?: string })?.message || `HTTP ${status}`
              );
              console.error(chalk.red(JSON.stringify(data)));
              process.exit(1);
            }
            spinner.succeed('Organization deleted');
          } catch (e) {
            spinner.fail('Failed');
            console.error(
              chalk.red(e instanceof Error ? e.message : String(e))
            );
            process.exit(1);
          }
        }
      )
  )
  .addCommand(
    new Command('members')
      .description('List, add, or remove organization members')
      .addCommand(
        new Command('list')
          .description('List members of an org')
          .argument('<orgId>', 'Organization id or slug')
          .action(async (orgId: string, _options, command: Command) => {
            const { url, timeout } = getGlobalOpts(command);
            const base = url.replace(/\/$/, '');
            const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members`;
            const spinner = ora('Fetching members...').start();
            try {
              const { data, status } = await fetchJson<{
                members: Array<{ email: string; role: string }>;
              }>(`${base}${pathname}`, { method: 'GET', timeout });
              if (status !== 200) {
                spinner.fail('Failed');
                console.error(chalk.red(JSON.stringify(data)));
                process.exit(1);
              }
              spinner.succeed('OK');
              const members =
                (data as { members?: Array<{ email: string; role: string }> })
                  ?.members ?? [];
              console.log(JSON.stringify(members, null, 2));
            } catch (e) {
              spinner.fail('Request failed');
              console.error(
                chalk.red(e instanceof Error ? e.message : String(e))
              );
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('add')
          .description('Add a member by email')
          .argument('<orgId>', 'Organization id or slug')
          .argument('<email>', 'Member email address')
          .option('-r, --role <role>', 'Role: member or admin', 'member')
          .action(
            async (
              orgId: string,
              email: string,
              options: { role: string },
              command: Command
            ) => {
              const { url, timeout } = getGlobalOpts(command);
              const spinner = ora('Adding member...').start();
              try {
                const authHeaders = getAuthHeaders();
                const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members`;
                const body = {
                  email: email.trim(),
                  role: options.role === 'admin' ? 'admin' : 'member',
                };
                const base = url.replace(/\/$/, '');
                const { data, status } = await fetchJson(`${base}${pathname}`, {
                  method: 'POST',
                  body: JSON.stringify(body),
                  timeout,
                  headers: authHeaders,
                });
                if (status >= 400) {
                  spinner.fail(
                    (data as { message?: string })?.message || `HTTP ${status}`
                  );
                  console.error(chalk.red(JSON.stringify(data)));
                  process.exit(1);
                }
                spinner.succeed('Member added');
              } catch (e) {
                spinner.fail('Failed');
                console.error(
                  chalk.red(e instanceof Error ? e.message : String(e))
                );
                process.exit(1);
              }
            }
          )
      )
      .addCommand(
        new Command('update')
          .description('Update a member role (admin or member)')
          .argument('<orgId>', 'Organization id or slug')
          .argument('<email>', 'Member email address')
          .requiredOption('-r, --role <role>', 'New role: admin or member')
          .action(
            async (
              orgId: string,
              email: string,
              options: { role: string },
              command: Command
            ) => {
              const { url, timeout } = getGlobalOpts(command);
              const role = options.role === 'admin' ? 'admin' : 'member';
              const spinner = ora('Updating member role...').start();
              try {
                const authHeaders = getAuthHeaders();
                const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(email.trim())}`;
                const body = { role };
                const base = url.replace(/\/$/, '');
                const { data, status } = await fetchJson(`${base}${pathname}`, {
                  method: 'PATCH',
                  body: JSON.stringify(body),
                  timeout,
                  headers: authHeaders,
                });
                if (status >= 400) {
                  spinner.fail(
                    (data as { message?: string })?.message || `HTTP ${status}`
                  );
                  console.error(chalk.red(JSON.stringify(data)));
                  process.exit(1);
                }
                spinner.succeed(`Role updated to "${role}"`);
              } catch (e) {
                spinner.fail('Failed');
                console.error(
                  chalk.red(e instanceof Error ? e.message : String(e))
                );
                process.exit(1);
              }
            }
          )
      )
      .addCommand(
        new Command('remove')
          .description('Remove a member by email')
          .argument('<orgId>', 'Organization id or slug')
          .argument('<email>', 'Member email address')
          .action(
            async (
              orgId: string,
              email: string,
              _options,
              command: Command
            ) => {
              const { url, timeout } = getGlobalOpts(command);
              const spinner = ora('Removing member...').start();
              try {
                const authHeaders = getAuthHeaders();
                const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(email.trim())}`;
                const base = url.replace(/\/$/, '');
                const { data, status } = await fetchJson(`${base}${pathname}`, {
                  method: 'DELETE',
                  timeout,
                  headers: authHeaders,
                });
                if (status >= 400) {
                  spinner.fail(
                    (data as { message?: string })?.message || `HTTP ${status}`
                  );
                  console.error(chalk.red(JSON.stringify(data)));
                  process.exit(1);
                }
                spinner.succeed('Member removed');
              } catch (e) {
                spinner.fail('Failed');
                console.error(
                  chalk.red(e instanceof Error ? e.message : String(e))
                );
                process.exit(1);
              }
            }
          )
      )
  )
  .addCommand(
    new Command('packages')
      .description('Link or unlink packages to the organization')
      .addCommand(
        new Command('link')
          .description('Link a package to the organization')
          .argument('<orgId>', 'Organization id or slug')
          .argument('<package>', 'Package name')
          .action(
            async (orgId: string, pkg: string, _options, command: Command) => {
              const { url, timeout } = getGlobalOpts(command);
              const spinner = ora('Linking package...').start();
              try {
                const authHeaders = getAuthHeaders();
                const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/packages`;
                const body = { package: pkg.trim() };
                const base = url.replace(/\/$/, '');
                const { data, status } = await fetchJson(`${base}${pathname}`, {
                  method: 'POST',
                  body: JSON.stringify(body),
                  timeout,
                  headers: authHeaders,
                });
                if (status >= 400) {
                  spinner.fail(
                    (data as { message?: string })?.message || `HTTP ${status}`
                  );
                  console.error(chalk.red(JSON.stringify(data)));
                  process.exit(1);
                }
                spinner.succeed('Package linked');
              } catch (e) {
                spinner.fail('Failed');
                console.error(
                  chalk.red(e instanceof Error ? e.message : String(e))
                );
                process.exit(1);
              }
            }
          )
      )
      .addCommand(
        new Command('unlink')
          .description('Unlink a package from the organization')
          .argument('<orgId>', 'Organization id or slug')
          .argument('<package>', 'Package name')
          .action(
            async (orgId: string, pkg: string, _options, command: Command) => {
              const { url, timeout } = getGlobalOpts(command);
              const spinner = ora('Unlinking package...').start();
              try {
                const authHeaders = getAuthHeaders();
                const pathname = `/api/v2/orgs/${encodeURIComponent(orgId)}/packages/${encodeURIComponent(pkg.trim())}`;
                const base = url.replace(/\/$/, '');
                const { data, status } = await fetchJson(`${base}${pathname}`, {
                  method: 'DELETE',
                  timeout,
                  headers: authHeaders,
                });
                if (status >= 400) {
                  spinner.fail(
                    (data as { message?: string })?.message || `HTTP ${status}`
                  );
                  console.error(chalk.red(JSON.stringify(data)));
                  process.exit(1);
                }
                spinner.succeed('Package unlinked');
              } catch (e) {
                spinner.fail('Failed');
                console.error(
                  chalk.red(e instanceof Error ? e.message : String(e))
                );
                process.exit(1);
              }
            }
          )
      )
  );
