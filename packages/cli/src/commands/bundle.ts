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
import tar from 'tar';
import { LocalDataStore, BundleManifest } from '../lib/local-storage.js';
import { LocalConfig } from '../lib/local-config.js';
import { LocalArtifactServer } from '../lib/local-artifacts.js';

export const bundleCommand = new Command('bundle')
  .description('Manage application bundles (V2)')
  .addCommand(createPushCommand())
  .addCommand(createGetCommand());

function createPushCommand(): Command {
  return new Command('push')
    .description('Push a bundle (.mpk) to the registry')
    .argument('<bundle-file>', 'Path to the .mpk bundle file')
    .option('--local', 'Push to local registry instance', true) // Default to local for now
    .action(async (bundleFile, options) => {
      try {
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
        if (options.local) {
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
        } else {
          console.error('❌ Remote push not implemented yet');
          process.exit(1);
        }
      } catch (error) {
        console.error('❌ Failed to push bundle:', error);
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

// Helper to extract manifest.json from .mpk (tar.gz)
async function extractManifest(
  bundlePath: string
): Promise<BundleManifest | null> {
  let manifestContent: string | null = null;

  // @ts-expect-error tar typing issue
  await tar.t({
    file: bundlePath,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onentry: (entry: any) => {
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
