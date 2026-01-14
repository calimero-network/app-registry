/**
 * Bundle Management Commands
 *
 * Implements:
 * - bundle push <file.mpk>
 * - bundle get <package> <version>
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import * as tar from 'tar';
import crypto from 'crypto';
import { LocalDataStore, BundleManifest } from '../lib/local-storage.js';
import { LocalConfig } from '../lib/local-config.js';
import { LocalArtifactServer } from '../lib/local-artifacts.js';
import { RemoteConfig } from '../lib/remote-config.js';

interface BundlePushPayload {
  version: string;
  package: string;
  appVersion: string;
  _binary: string;
  _overwrite: boolean;
  metadata?: BundleManifest['metadata'];
  interfaces?: BundleManifest['interfaces'];
  wasm?: BundleManifest['wasm'];
  abi?: BundleManifest['abi'];
  migrations?: BundleManifest['migrations'];
  links?: BundleManifest['links'];
  signature?: BundleManifest['signature'];
}

interface ApiResponseBody {
  message?: string;
  error?: string;
  package?: string;
  version?: string;
  [key: string]: unknown;
}

export const bundleCommand = new Command('bundle')
  .description('Manage application bundles (V2)')
  .addCommand(createCreateCommand())
  .addCommand(createPushCommand())
  .addCommand(createGetCommand());

function createCreateCommand(): Command {
  return new Command('create')
    .description('Create an MPK bundle from a WASM file')
    .argument('<wasm-file>', 'Path to the WASM file')
    .argument('<package>', 'Package name (e.g. com.calimero.myapp)')
    .argument('<version>', 'Version (e.g. 1.0.0)')
    .option('-o, --output <path>', 'Output path for the MPK file')
    .option('--name <name>', 'Application name')
    .option('--description <description>', 'Application description')
    .option('--author <author>', 'Application author', 'Calimero Team')
    .option('--frontend <url>', 'Frontend URL')
    .option('--github <url>', 'GitHub URL')
    .option('--docs <url>', 'Documentation URL')
    .option(
      '--export <interface>',
      'Export interface (can be specified multiple times)',
      (value, prev) => {
        return [...(prev || []), value];
      }
    )
    .option(
      '--use <interface>',
      'Use interface (can be specified multiple times)',
      (value, prev) => {
        return [...(prev || []), value];
      }
    )
    .action(async (wasmFile, pkg, version, options) => {
      try {
        const wasmPath = path.resolve(wasmFile);
        if (!fs.existsSync(wasmPath)) {
          console.error(`❌ WASM file not found: ${wasmFile}`);
          process.exit(1);
        }

        console.log(`📦 Creating MPK bundle from: ${path.basename(wasmPath)}`);

        // Read WASM file
        const wasmContent = fs.readFileSync(wasmPath);
        const wasmSize = wasmContent.length;

        // Calculate SHA256 hash
        const hash = crypto
          .createHash('sha256')
          .update(wasmContent)
          .digest('hex');

        // Build metadata
        const metadata: {
          name: string;
          description: string;
          author: string;
        } = {
          name: options.name || pkg,
          description: options.description || '',
          author: options.author || 'Calimero Team',
        };

        // Build links if provided
        const links: {
          frontend?: string;
          github?: string;
          docs?: string;
        } = {};
        if (options.frontend) links.frontend = options.frontend;
        if (options.github) links.github = options.github;
        if (options.docs) links.docs = options.docs;

        // Build interfaces
        const interfaces = {
          exports: options.export || [],
          uses: options.use || [],
        };

        // Create bundle manifest
        const manifest: BundleManifest = {
          version: '1.0',
          package: pkg,
          appVersion: version,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          interfaces:
            interfaces.exports.length > 0 || interfaces.uses.length > 0
              ? interfaces
              : undefined,
          wasm: {
            path: 'app.wasm',
            hash: hash,
            size: wasmSize,
          },
          abi: null,
          migrations: [],
          links: Object.keys(links).length > 0 ? links : undefined,
          signature: undefined,
        };

        // Determine output path
        let outputPath = options.output;
        if (!outputPath) {
          const outputDir = path.join(process.cwd(), pkg, version);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          outputPath = path.join(outputDir, `${pkg}-${version}.mpk`);
        } else {
          outputPath = path.resolve(outputPath);
          const outputDir = path.dirname(outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
        }

        // Create temporary directory for bundle contents
        const tempDir = path.join(
          path.dirname(outputPath),
          `.temp-bundle-${Date.now()}`
        );
        fs.mkdirSync(tempDir, { recursive: true });

        try {
          // Write manifest.json
          fs.writeFileSync(
            path.join(tempDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
          );

          // Copy WASM file as app.wasm
          fs.writeFileSync(path.join(tempDir, 'app.wasm'), wasmContent);

          // Create gzip-compressed tar archive
          await tar.create(
            {
              gzip: true,
              file: outputPath,
              cwd: tempDir,
            },
            ['manifest.json', 'app.wasm']
          );

          const outputSize = fs.statSync(outputPath).size;
          console.log(`✅ Created MPK bundle: ${outputPath}`);
          console.log(`   Package: ${pkg}`);
          console.log(`   Version: ${version}`);
          console.log(`   Size: ${outputSize} bytes`);
          console.log(`   WASM Hash: ${hash}`);
        } finally {
          // Cleanup temp directory
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to create bundle:', message);
        process.exit(1);
      }
    });
}

function createPushCommand(): Command {
  return new Command('push')
    .description(
      'Push a bundle (.mpk) to the registry (local or remote). Defaults to local registry.'
    )
    .argument('<bundle-file>', 'Path to the .mpk bundle file')
    .option('--local', 'Push to local registry instance (default)')
    .option('--remote', 'Push to remote registry instance')
    .option(
      '--url <registry-url>',
      'Registry URL for remote push (overrides config file)'
    )
    .option(
      '--api-key <key>',
      'API key for authentication (overrides config file and env var)'
    )
    .addHelpText(
      'after',
      `
Examples:
  $ calimero-registry bundle push bundle.mpk --local
  $ calimero-registry bundle push bundle.mpk --remote
  $ calimero-registry bundle push bundle.mpk --remote --url https://apps.calimero.network
  $ calimero-registry bundle push bundle.mpk --remote --api-key your-api-key

Configuration:
  Set defaults using the config command:
  $ calimero-registry config set registry-url https://apps.calimero.network
  $ calimero-registry config set api-key your-api-key
  
  Or use environment variables:
  $ export CALIMERO_REGISTRY_URL=https://apps.calimero.network
  $ export CALIMERO_API_KEY=your-api-key

Note:
  - Use --local for development/testing with local registry
  - Use --remote for production deployments
  - Config file values are used unless overridden by flags or environment variables
  - Priority: flag > environment variable > config file > default
`
    )
    .action(async (bundleFile, options) => {
      try {
        // Warn if remote-only options are used without --remote
        if (!options.remote && (options.url || options.apiKey)) {
          console.warn(
            '⚠️  Warning: --url and --api-key are only used with --remote flag'
          );
          console.warn(
            '   These options will be ignored. Use --remote to push to remote registry.'
          );
        }

        // Determine mode: default to local if neither flag is set
        const useLocal = options.local ?? !options.remote;
        const useRemote = options.remote ?? false;

        // Ensure mutually exclusive flags
        if (options.local && options.remote) {
          console.error('❌ Cannot use both --local and --remote flags');
          process.exit(1);
        }

        const fullPath = path.resolve(bundleFile);
        if (!fs.existsSync(fullPath)) {
          console.error(`❌ File not found: ${bundleFile}`);
          process.exit(1);
        }

        console.log(`📦 Processing bundle: ${path.basename(fullPath)}`);

        // 1. Read bundle and extract manifest
        const manifest = await extractManifest(fullPath);

        if (!manifest) {
          console.error('❌ manifest.json not found in bundle');
          process.exit(1);
        }

        // 2. Validate manifest
        if (!manifest.package || !manifest.appVersion) {
          console.error('❌ Invalid manifest: missing package or appVersion');
          process.exit(1);
        }

        console.log(`   Package: ${manifest.package}`);
        console.log(`   Version: ${manifest.appVersion}`);
        if (manifest.metadata) {
          console.log(`   Name: ${manifest.metadata.name}`);
        }

        // 3. Store (Local Mode)
        if (useLocal) {
          const config = new LocalConfig();
          const store = new LocalDataStore(config);
          const artifactServer = new LocalArtifactServer(config, store);

          // Copy bundle artifact to local storage
          const bundleFilename = `${manifest.package}-${manifest.appVersion}.mpk`;
          const targetPath = await artifactServer.copyArtifactToLocal(
            fullPath,
            manifest.package,
            manifest.appVersion,
            bundleFilename
          );

          console.log(`   Artifact stored: ${targetPath}`);

          // Update manifest with local artifact path/url?
          // Actually, for V2 bundles, the registry serves the whole .mpk.
          // The manifest inside the registry is metadata.
          // We might want to store the bundle download URL in the manifest we serve via API?
          // Or just keep it implicit (API constructs download link).

          // For local-storage, we can add a field to track where the .mpk is.
          // But LocalDataStore mainly stores the JSON.
          // The artifacts are stored by convention in artifacts/package/version/.

          store.setBundleManifest(
            manifest.package,
            manifest.appVersion,
            manifest
          );
          console.log('✅ Bundle manifest registered locally');
          console.log(
            `   Run 'calimero-registry bundle get ${manifest.package} ${manifest.appVersion}' to verify`
          );
        } else if (useRemote) {
          // Remote Mode: Push to remote registry
          // Get values from config file, with flag/environment variable overrides
          const remoteConfig = new RemoteConfig();
          const registryUrl =
            options.url ||
            process.env.CALIMERO_REGISTRY_URL ||
            remoteConfig.getRegistryUrl();
          const apiKey =
            options.apiKey ||
            process.env.CALIMERO_API_KEY ||
            remoteConfig.getApiKey();

          await pushToRemote(fullPath, manifest, registryUrl, apiKey);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ Failed to push bundle:', message);
        process.exit(1);
      }
    });
}

function createGetCommand(): Command {
  return new Command('get')
    .description('Get bundle manifest')
    .argument('<package>', 'Package name (e.g. com.calimero.kv)')
    .argument('<version>', 'Version (e.g. 1.0.0)')
    .option('--local', 'Use local registry', true)
    .action(async (pkg, version, options) => {
      try {
        if (options.local) {
          const config = new LocalConfig();
          const store = new LocalDataStore(config);
          const manifest = store.getBundleManifest(pkg, version);

          if (manifest) {
            console.log(JSON.stringify(manifest, null, 2));
          } else {
            console.error(`❌ Manifest not found: ${pkg}@${version}`);
            process.exit(1);
          }
        } else {
          console.error('❌ Remote get not implemented yet');
          process.exit(1);
        }
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    });
}

// Helper to push bundle to remote registry
async function pushToRemote(
  bundlePath: string,
  manifest: BundleManifest,
  registryUrl: string,
  apiKey?: string
): Promise<void> {
  try {
    console.log(`📤 Pushing to remote registry: ${registryUrl}`);

    // 1. Read bundle file as binary
    const bundleBuffer = fs.readFileSync(bundlePath);
    const bundleSize = bundleBuffer.length;
    console.log(`   Bundle size: ${bundleSize} bytes`);

    // 2. Convert bundle to hex string
    const bundleHex = bundleBuffer.toString('hex');
    console.log(`   Converted to hex (${bundleHex.length} characters)`);

    // 3. Build request payload matching API format
    const payload: BundlePushPayload = {
      version: manifest.version || '1.0',
      package: manifest.package,
      appVersion: manifest.appVersion,
      _binary: bundleHex,
      _overwrite: true,
    };

    // Preserve all manifest fields
    if (manifest.metadata) {
      payload.metadata = manifest.metadata;
    }
    if (manifest.interfaces) {
      payload.interfaces = manifest.interfaces;
    }
    if (manifest.wasm) {
      payload.wasm = manifest.wasm;
    }
    if (manifest.abi) {
      payload.abi = manifest.abi;
    }
    if (manifest.migrations && manifest.migrations.length > 0) {
      payload.migrations = manifest.migrations;
    }
    if (manifest.links) {
      payload.links = manifest.links;
    }
    if (manifest.signature) {
      payload.signature = manifest.signature;
    }

    // 4. Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if provided (from option or environment variable)
    const finalApiKey = apiKey || process.env.CALIMERO_API_KEY;
    if (finalApiKey) {
      headers['Authorization'] = `Bearer ${finalApiKey}`;
    }

    // 5. POST to remote registry
    const apiUrl = `${registryUrl.replace(/\/$/, '')}/api/v2/bundles/push`;
    console.log(`   POST ${apiUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseBody: ApiResponseBody;
      try {
        responseBody = JSON.parse(responseText) as ApiResponseBody;
      } catch {
        responseBody = { message: responseText };
      }

      // 6. Handle response
      if (response.status === 201) {
        console.log('✅ Bundle manifest uploaded successfully');
        console.log(`   Package: ${responseBody.package || manifest.package}`);
        console.log(
          `   Version: ${responseBody.version || manifest.appVersion}`
        );

        // 7. Verify bundle was stored correctly
        await verifyRemotePush(
          registryUrl,
          manifest.package,
          manifest.appVersion
        );
      } else {
        // Handle error responses
        handlePushError(response.status, responseBody);
      }
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('❌ Request timed out after 60 seconds');
        console.error('   The bundle may be too large or the server is slow');
        process.exit(1);
      }
      throw fetchError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to push to remote registry:', message);
    throw error;
  }
}

// Helper to verify bundle was stored correctly
async function verifyRemotePush(
  registryUrl: string,
  packageName: string,
  version: string
): Promise<void> {
  try {
    console.log('🔍 Verifying upload to remote registry...');

    const verifyUrl = `${registryUrl.replace(/\/$/, '')}/api/v2/bundles/${packageName}/${version}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(verifyUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        await response.json(); // Consume response body
        console.log('✅ Bundle verified and accessible on remote registry');
        console.log(`🌐 Registry: ${registryUrl}`);
        console.log(`🔗 Endpoint: ${verifyUrl}`);
      } else {
        console.warn(
          `⚠️  Upload verification failed - bundle not found (HTTP ${response.status})`
        );
        console.warn('   The bundle may still be processing, check manually');
      }
    } catch (verifyError: unknown) {
      clearTimeout(timeoutId);
      if (verifyError instanceof Error && verifyError.name === 'AbortError') {
        console.warn('⚠️  Verification request timed out');
      } else {
        console.warn('⚠️  Verification request failed:', verifyError.message);
      }
      console.warn('   The bundle may still be accessible, check manually');
    }
  } catch (error) {
    // Verification failure is not critical
    console.warn('⚠️  Could not verify bundle:', error);
  }
}

// Helper to handle push errors with helpful messages
function handlePushError(
  statusCode: number,
  responseBody: ApiResponseBody
): void {
  const errorMessage =
    responseBody.message || responseBody.error || 'Unknown error';

  switch (statusCode) {
    case 400:
      console.error('❌ Bad Request: Invalid manifest');
      console.error(`   ${errorMessage}`);
      console.error('   Check that your bundle manifest is valid');
      break;
    case 401:
      console.error('❌ Unauthorized: Authentication required');
      console.error(`   ${errorMessage}`);
      console.error(
        '   Provide an API key with --api-key or CALIMERO_API_KEY env var'
      );
      break;
    case 403:
      console.error('❌ Forbidden: Namespace ownership required');
      console.error(`   ${errorMessage}`);
      console.error(
        '   Ensure you have permission to publish to this package namespace'
      );
      break;
    case 409:
      console.error('❌ Conflict: Version already exists');
      console.error(`   ${errorMessage}`);
      console.error(
        '   Increment the version number and try again, or contact registry admin'
      );
      break;
    case 500:
      console.error('❌ Internal Server Error');
      console.error(`   ${errorMessage}`);
      console.error('   The registry server encountered an error');
      break;
    default:
      console.error(`❌ Upload failed with HTTP ${statusCode}`);
      console.error(`   ${errorMessage}`);
  }

  process.exit(1);
}

// Helper to extract manifest.json from .mpk (tar.gz)
async function extractManifest(
  bundlePath: string
): Promise<BundleManifest | null> {
  let manifestContent: string | null = null;

  // @ts-expect-error tar typing issue
  await tar.t({
    file: bundlePath,

    onentry: (entry: tar.ReadEntry) => {
      if (entry.path === 'manifest.json') {
        // Found it
      }
    },
  });

  // Actual extraction
  const extractDir = path.join(path.dirname(bundlePath), `.temp-${Date.now()}`);
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir);
  }

  try {
    // @ts-expect-error tar typing issue
    await tar.x({
      file: bundlePath,
      cwd: extractDir,
      filter: (path: string) => path === 'manifest.json',
    });

    const manifestPath = path.join(extractDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      manifestContent = content;
    }
  } catch {
    // ignore
  } finally {
    // Cleanup
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }

  if (manifestContent) {
    try {
      return JSON.parse(manifestContent) as BundleManifest;
    } catch {
      console.error('Failed to parse manifest JSON');
      return null;
    }
  }

  return null;
}
