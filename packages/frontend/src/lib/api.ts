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
});

// Error interceptor
api.interceptors.response.use(
  response => response,
  error => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bundles.map((bundle: any) => ({
    id: bundle.package,
    name: bundle.metadata?.name || bundle.package,
    developer_pubkey: bundle.signature?.pubkey || 'unknown',
    latest_version: bundle.appVersion,
    alias: bundle.metadata?.name,
    developer: bundle.signature?.pubkey
      ? {
          display_name: bundle.metadata?.name || bundle.package,
          pubkey: bundle.signature.pubkey,
        }
      : undefined,
  }));
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
