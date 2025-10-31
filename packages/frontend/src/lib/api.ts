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
  const response = await api.get('/apps', { params });
  // Handle both direct array response and paginated response
  if (Array.isArray(response.data)) {
    return response.data;
  }
  // If response has apps property (paginated format), return the apps array
  return response.data.apps || [];
};

export const getAppVersions = async (appId: string): Promise<VersionInfo[]> => {
  const response = await api.get(`/v1/apps/${appId}`);
  // Transform V1 API response to frontend format
  const versions = response.data.versions || [];
  return versions.map((version: string) => ({
    semver: version,
    cid: `ipfs://${appId}@${version}`, // Mock CID for development
    yanked: false,
  }));
};

export const getAppManifest = async (
  appId: string,
  semver: string
): Promise<AppManifest> => {
  const response = await api.get(`/v1/apps/${appId}/${semver}`);
  const manifest = response.data;

  // Transform V1 API response to frontend AppManifest format
  return {
    manifest_version: manifest.manifest_version,
    app: {
      name: manifest.name,
      developer_pubkey: 'dev-key-unknown', // V1 API doesn't have developer info
      id: manifest.id,
      alias: manifest.id,
    },
    version: {
      semver: manifest.version,
    },
    supported_chains: manifest.chains || ['near:testnet'],
    permissions: [
      {
        cap: 'basic',
        bytes: 1024,
      },
    ],
    artifacts: [
      {
        type: manifest.artifact.type,
        target: manifest.artifact.target,
        cid: manifest.artifact.uri,
        size: 1024,
      },
    ],
    metadata: {
      provides: manifest.provides || [],
      requires: manifest.requires || [],
    },
    distribution: 'ipfs',
    signature: manifest.signature || {
      alg: 'ed25519',
      sig: 'dev-signature',
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
