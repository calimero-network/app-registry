/**
 * V1 CLI Commands
 *
 * Implements CLI commands for the v1 API: push, get, ls, resolve, verify
 */

import { Command } from 'commander';
import fs from 'fs';
import fetch from 'node-fetch';

interface V1Manifest {
  manifest_version: '1.0';
  id: string;
  name: string;
  version: string;
  chains: string[];
  artifact: {
    type: 'wasm';
    target: 'node';
    digest: string;
    uri: string;
  };
  provides?: string[];
  requires?: string[];
  dependencies?: { id: string; range: string }[];
  signature?: {
    alg: 'ed25519';
    pubkey: string;
    sig: string;
    signed_at: string;
  };
  _warnings?: string[];
}

export const v1Command = new Command('v1')
  .description('V1 API commands for Calimero SSApp Registry')
  .addCommand(createPushCommand())
  .addCommand(createGetCommand())
  .addCommand(createListCommand())
  .addCommand(createResolveCommand())
  .addCommand(createVerifyCommand());

function createPushCommand(): Command {
  return new Command('push')
    .description('Submit a v1 manifest to the registry')
    .argument('<manifest-file>', 'Path to manifest JSON file')
    .option('--local', 'Use local registry')
    .action(
      async (
        manifestFile: string,
        options: { local?: boolean } = {},
        command
      ) => {
        try {
          const globalOpts = command.parent?.parent?.opts();
          const useLocal = globalOpts?.local || options.local || false;

          // Read and validate manifest file
          if (!fs.existsSync(manifestFile)) {
            console.error(`❌ Manifest file not found: ${manifestFile}`);
            process.exit(1);
          }

          const manifestContent = fs.readFileSync(manifestFile, 'utf8');
          const manifest: V1Manifest = JSON.parse(manifestContent);

          // Basic validation
          if (manifest.manifest_version !== '1.0') {
            console.error('❌ Invalid manifest version. Must be "1.0"');
            process.exit(1);
          }

          if (!manifest.id || !manifest.name || !manifest.version) {
            console.error('❌ Missing required fields: id, name, version');
            process.exit(1);
          }

          // Get registry URL
          const baseUrl = useLocal
            ? 'http://localhost:8082'
            : 'http://localhost:8080';

          console.log(
            `📤 Submitting manifest: ${manifest.id}@${manifest.version}`
          );
          console.log(`   Name: ${manifest.name}`);
          console.log(`   Chains: ${manifest.chains?.join(', ')}`);
          console.log(
            `   Provides: ${manifest.provides?.join(', ') || 'none'}`
          );
          console.log(
            `   Requires: ${manifest.requires?.join(', ') || 'none'}`
          );

          // Submit to registry
          const response = await fetch(`${baseUrl}/v1/apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manifest),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(`${error.error}: ${error.details}`);
          }

          const result = await response.json();

          console.log('✅ Manifest submitted successfully!');
          console.log(`   ID: ${result.id}`);
          console.log(`   Version: ${result.version}`);
          console.log(`   URI: ${result.canonical_uri}`);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ Failed to submit manifest:', errorMessage);
          process.exit(1);
        }
      }
    );
}

function createGetCommand(): Command {
  return new Command('get')
    .description('Get manifest from registry')
    .argument('<app-id>', 'Application ID')
    .argument('[version]', 'Specific version (optional)')
    .option('--local', 'Use local registry')
    .option('--canonical', 'Return canonical JCS format')
    .action(
      async (
        appId: string,
        version?: string,
        options: { local?: boolean; canonical?: boolean } = {},
        command
      ) => {
        try {
          const globalOpts = command.parent?.parent?.opts();
          const useLocal = globalOpts?.local || options.local || false;
          const baseUrl = useLocal
            ? 'http://localhost:8082'
            : 'http://localhost:8080';

          if (version) {
            // Get specific version
            console.log(`📥 Getting manifest: ${appId}@${version}`);

            const url = options.canonical
              ? `/v1/apps/${appId}/${version}?canonical=true`
              : `/v1/apps/${appId}/${version}`;

            const response = await fetch(`${baseUrl}${url}`);

            if (!response.ok) {
              if (response.status === 404) {
                console.error(`❌ Manifest not found: ${appId}@${version}`);
              } else {
                console.error(
                  `❌ Error: ${response.status} ${response.statusText}`
                );
              }
              process.exit(1);
            }

            const manifest = await response.json();
            console.log(JSON.stringify(manifest, null, 2));
          } else {
            // Get all versions
            console.log(`📥 Getting versions for: ${appId}`);

            const response = await fetch(`${baseUrl}/v1/apps/${appId}`);

            if (!response.ok) {
              if (response.status === 404) {
                console.error(`❌ App not found: ${appId}`);
              } else {
                console.error(
                  `❌ Error: ${response.status} ${response.statusText}`
                );
              }
              process.exit(1);
            }

            const result = await response.json();
            console.log(`📱 App: ${result.id}`);
            console.log(`📋 Versions: ${result.versions.join(', ')}`);
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ Failed to get manifest:', errorMessage);
          process.exit(1);
        }
      }
    );
}

function createListCommand(): Command {
  return new Command('ls')
    .description('List applications in registry')
    .option('--local', 'Use local registry')
    .option('--search <query>', 'Search query')
    .action(
      async (options: { local?: boolean; search?: string } = {}, command) => {
        try {
          const globalOpts = command.parent?.parent?.opts();
          const useLocal = globalOpts?.local || options.local || false;
          const baseUrl = useLocal
            ? 'http://localhost:8082'
            : 'http://localhost:8080';

          if (options.search) {
            // Search manifests
            console.log(`🔍 Searching for: ${options.search}`);

            const response = await fetch(
              `${baseUrl}/v1/search?q=${encodeURIComponent(options.search)}`
            );

            if (!response.ok) {
              console.error(
                `❌ Error: ${response.status} ${response.statusText}`
              );
              process.exit(1);
            }

            const results = await response.json();

            if (results.length === 0) {
              console.log('No results found');
              return;
            }

            console.log(`Found ${results.length} result(s):`);
            results.forEach((result: { id: string; versions?: string[] }) => {
              console.log(
                `  📱 ${result.id}@${result.versions?.[0] || 'unknown'}`
              );
              if (result.provides?.length > 0) {
                console.log(`     Provides: ${result.provides.join(', ')}`);
              }
              if (result.requires?.length > 0) {
                console.log(`     Requires: ${result.requires.join(', ')}`);
              }
            });
          } else {
            // List all apps (this would need a different endpoint)
            console.log('📋 Listing all applications...');
            console.log(
              'Note: Use --search <query> to search for specific apps'
            );
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ Failed to list applications:', errorMessage);
          process.exit(1);
        }
      }
    );
}

function createResolveCommand(): Command {
  return new Command('resolve')
    .description('Resolve dependencies for an application')
    .argument('<app-id>', 'Application ID')
    .argument('<version>', 'Application version')
    .option('--local', 'Use local registry')
    .action(
      async (
        appId: string,
        version: string,
        options: { local?: boolean } = {},
        command
      ) => {
        try {
          const globalOpts = command.parent?.parent?.opts();
          const useLocal = globalOpts?.local || options.local || false;
          const baseUrl = useLocal
            ? 'http://localhost:8082'
            : 'http://localhost:8080';

          console.log(`🔍 Resolving dependencies for: ${appId}@${version}`);

          const resolveRequest = {
            root: { id: appId, version },
            installed: [], // Could be extended to support pre-installed apps
          };

          const response = await fetch(`${baseUrl}/v1/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resolveRequest),
          });

          if (!response.ok) {
            const error = await response.json();
            console.error(`❌ Resolution failed: ${error.error}`);
            console.error(`   Details: ${error.details}`);
            process.exit(1);
          }

          const result = await response.json();

          console.log('✅ Dependencies resolved successfully!');
          console.log(`📋 Installation plan:`);
          result.plan.forEach(
            (item: { action: string; id: string; version: string }) => {
              console.log(`   ${item.action}: ${item.id}@${item.version}`);
            }
          );

          if (result.satisfies?.length > 0) {
            console.log(`✅ Satisfies: ${result.satisfies.join(', ')}`);
          }

          if (result.missing?.length > 0) {
            console.log(`❌ Missing: ${result.missing.join(', ')}`);
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ Failed to resolve dependencies:', errorMessage);
          process.exit(1);
        }
      }
    );
}

function createVerifyCommand(): Command {
  return new Command('verify')
    .description('Verify manifest signature and integrity')
    .argument('<manifest-file>', 'Path to manifest JSON file')
    .action(async (manifestFile: string) => {
      try {
        // Read manifest file
        if (!fs.existsSync(manifestFile)) {
          console.error(`❌ Manifest file not found: ${manifestFile}`);
          process.exit(1);
        }

        const manifestContent = fs.readFileSync(manifestFile, 'utf8');
        const manifest: V1Manifest = JSON.parse(manifestContent);

        console.log(
          `🔍 Verifying manifest: ${manifest.id}@${manifest.version}`
        );

        // Verify manifest structure
        if (manifest.manifest_version !== '1.0') {
          console.error('❌ Invalid manifest version');
          process.exit(1);
        }

        // Verify required fields
        const requiredFields = ['id', 'name', 'version', 'chains', 'artifact'];
        const missingFields = requiredFields.filter(
          field => !manifest[field as keyof V1Manifest]
        );

        if (missingFields.length > 0) {
          console.error(
            `❌ Missing required fields: ${missingFields.join(', ')}`
          );
          process.exit(1);
        }

        // Verify artifact
        if (
          manifest.artifact.type !== 'wasm' ||
          manifest.artifact.target !== 'node'
        ) {
          console.error('❌ Invalid artifact type or target');
          process.exit(1);
        }

        if (!manifest.artifact.digest.match(/^sha256:[0-9a-f]{64}$/)) {
          console.error('❌ Invalid artifact digest format');
          process.exit(1);
        }

        if (!manifest.artifact.uri.match(/^(https:\/\/|ipfs:\/\/)/)) {
          console.error('❌ Invalid artifact URI format');
          process.exit(1);
        }

        // Verify signature if present
        if (manifest.signature) {
          console.log('🔐 Verifying signature...');
          // Note: Actual signature verification would require the V1Utils
          console.log('⚠️  Signature verification not implemented in CLI yet');
        }

        console.log('✅ Manifest verification passed!');
        console.log(`   ID: ${manifest.id}`);
        console.log(`   Name: ${manifest.name}`);
        console.log(`   Version: ${manifest.version}`);
        console.log(`   Chains: ${manifest.chains.join(', ')}`);
        console.log(`   Artifact: ${manifest.artifact.uri}`);

        if (manifest.provides?.length > 0) {
          console.log(`   Provides: ${manifest.provides.join(', ')}`);
        }

        if (manifest.requires?.length > 0) {
          console.log(`   Requires: ${manifest.requires.join(', ')}`);
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to verify manifest:', errorMessage);
        process.exit(1);
      }
    });
}
