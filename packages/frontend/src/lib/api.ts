import axios from 'axios';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
} from '@/types/api';

export const api = axios.create({
  baseURL:
    (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
    '/api',
  timeout: 10000,
  withCredentials: true, // send cookies (session) with requests
});

// Error interceptor
api.interceptors.response.use(
  response => response,
  error => {
    // Friendly message when backend is not running (proxy returns ECONNREFUSED)
    if (error.code === 'ERR_NETWORK' || !error.response) {
      error.message =
        'Backend is not running. Start both backend and frontend: pnpm dev:all';
    }
    // eslint-disable-next-line no-console
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const getApps = async (params?: {
  dev?: string;
  name?: string;
}): Promise<AppSummary[]> => {
  // Use V2 Bundle API
  const v2Params: Record<string, string> = {};
  if (params?.dev) {
    v2Params.developer = params.dev;
  }
  if (params?.name) {
    v2Params.package = params.name;
  }

  const response = await api.get('/v2/bundles', { params: v2Params });
  const bundles = Array.isArray(response.data) ? response.data : [];

  // Transform V2 BundleManifest to AppSummary format
  // Use metadata.author as the developer identity (most bundles don't have signatures)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bundles.map((bundle: any) => {
    const author = bundle.metadata?.author || 'Unknown';
    return {
      id: bundle.package,
      name: bundle.metadata?.name || bundle.package,
      package_name: bundle.package,
      developer_pubkey: author,
      latest_version: bundle.appVersion,
      alias: bundle.metadata?.name,
      developer: {
        display_name: author,
        pubkey: author,
      },
    };
  });
};

/** Fetch bundles filtered by metadata.author (e.g. current user email for "My packages"). */
export const getMyPackages = async (
  authorEmail: string
): Promise<AppSummary[]> => {
  if (!authorEmail?.trim()) return [];
  const response = await api.get('/v2/bundles', {
    params: { author: authorEmail.trim() },
  });
  const bundles = Array.isArray(response.data) ? response.data : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bundles.map((bundle: any) => {
    const author = bundle.metadata?.author || 'Unknown';
    return {
      id: bundle.package,
      name: bundle.metadata?.name || bundle.package,
      package_name: bundle.package,
      developer_pubkey: author,
      latest_version: bundle.appVersion,
      alias: bundle.metadata?.name,
      developer: {
        display_name: author,
        pubkey: author,
      },
    };
  });
};

export const getAppVersions = async (appId: string): Promise<VersionInfo[]> => {
  // Use V2 Bundle API - get all bundles for this package
  const response = await api.get('/v2/bundles', {
    params: { package: appId },
  });
  const bundles = Array.isArray(response.data) ? response.data : [];

  // Transform V2 bundles to VersionInfo format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bundles.map((bundle: any) => {
    // Get artifact URL (convention: /artifacts/:package/:version/:package-:version.mpk)
    const artifactUrl = `/artifacts/${bundle.package}/${bundle.appVersion}/${bundle.package}-${bundle.appVersion}.mpk`;
    return {
      semver: bundle.appVersion,
      cid: artifactUrl,
      yanked: false,
    };
  });
};

export const getAppManifest = async (
  appId: string,
  semver: string
): Promise<AppManifest> => {
  // Use V2 Bundle API
  const response = await api.get(`/v2/bundles/${appId}/${semver}`);
  const bundle = response.data;

  // Transform V2 BundleManifest to frontend AppManifest format
  const artifactUrl = `/artifacts/${bundle.package}/${bundle.appVersion}/${bundle.package}-${bundle.appVersion}.mpk`;

  return {
    manifest_version: bundle.version,
    min_runtime_version: bundle.min_runtime_version ?? '0.1.0',
    app: {
      name: bundle.metadata?.name || bundle.package,
      developer_pubkey: bundle.signature?.pubkey || 'unknown',
      id: bundle.package,
      alias: bundle.metadata?.name,
    },
    version: {
      semver: bundle.appVersion,
    },
    supported_chains: [], // V2 bundles don't have chains in manifest
    permissions: [
      {
        cap: 'basic',
        bytes: bundle.wasm?.size || 0,
      },
    ],
    artifacts: [
      {
        type: 'mpk',
        target: 'node',
        cid: artifactUrl,
        size: bundle.wasm?.size || 0,
      },
    ],
    metadata: {
      provides: bundle.interfaces?.exports || [],
      requires: bundle.interfaces?.uses || [],
      description: bundle.metadata?.description,
      tags: bundle.metadata?.tags,
      license: bundle.metadata?.license,
      links: bundle.links,
    },
    distribution: 'registry',
    signature: bundle.signature
      ? {
          alg: bundle.signature.alg,
          sig: bundle.signature.sig,
          signed_at: bundle.signature.signedAt,
        }
      : {
          alg: 'ed25519',
          sig: 'unsigned',
          signed_at: new Date().toISOString(),
        },
  };
};

export const getDeveloper = async (
  pubkey: string
): Promise<DeveloperProfile> => {
  const response = await api.get(`/developers/${pubkey}`);
  return response.data;
};

export const getAttestation = async (
  pubkey: string,
  appName: string,
  semver: string
): Promise<Attestation> => {
  const response = await api.get(
    `/attestations/${pubkey}/${appName}/${semver}`
  );
  return response.data;
};

/** Get raw V2 bundle manifest for a single version (for edit page). */
export const getBundleManifestRaw = async (
  packageName: string,
  version: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> => {
  const response = await api.get(`/v2/bundles/${packageName}/${version}`);
  return response.data;
};

/** Push a .mpk bundle file to the registry (multipart). Returns { package, version } on success. */
export const pushBundleFile = async (
  file: File
): Promise<{ package: string; version: string }> => {
  const form = new FormData();
  form.append('bundle', file);
  const response = await api.post('/v2/bundles/push-file', form, {
    timeout: 120000,
  });
  return {
    package: response.data.package,
    version: response.data.version,
  };
};
