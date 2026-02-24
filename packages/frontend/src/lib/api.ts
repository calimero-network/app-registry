import axios from 'axios';
import {
  getStoredKeypair,
  getSignedHeaders,
  publicKeyToBase64url,
} from './org-keypair';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
  Org,
  OrgMember,
  OrgPackageList,
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

// ——— Organizations (V2 org API) ———

/** List orgs the given member (pubkey) belongs to. */
export const getOrgsByMember = async (
  memberPubkey: string
): Promise<Org[]> => {
  if (!memberPubkey?.trim()) return [];
  const response = await api.get<Org[]>('/v2/orgs', {
    params: { member: memberPubkey.trim() },
  });
  return Array.isArray(response.data) ? response.data : [];
};

/** Get a single org by id. */
export const getOrg = async (orgId: string): Promise<Org | null> => {
  const response = await api.get<Org>(`/v2/orgs/${encodeURIComponent(orgId)}`);
  return response.data ?? null;
};

/** List members of an org. */
export const getOrgMembers = async (
  orgId: string
): Promise<{ members: OrgMember[] }> => {
  const response = await api.get<{ members: OrgMember[] }>(
    `/v2/orgs/${encodeURIComponent(orgId)}/members`
  );
  return {
    members: Array.isArray(response.data?.members) ? response.data.members : [],
  };
};

/** List packages linked to an org. */
export const getOrgPackages = async (
  orgId: string
): Promise<OrgPackageList> => {
  const response = await api.get<OrgPackageList>(
    `/v2/orgs/${encodeURIComponent(orgId)}/packages`
  );
  return {
    packages: Array.isArray(response.data?.packages) ? response.data.packages : [],
  };
};

// ——— Signed org writes (Ed25519 keypair) ———

const API_BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env
  ?.VITE_API_URL || '/api';

function pathname(axiosPath: string): string {
  const base = API_BASE.replace(/\/$/, '');
  const p = axiosPath.startsWith('/') ? axiosPath : `/${axiosPath}`;
  return `${base}${p}`;
}

async function withSignedHeaders(
  method: string,
  axiosPath: string,
  body: Record<string, unknown> | null
): Promise<Record<string, string>> {
  const keypair = await getStoredKeypair();
  if (!keypair) {
    throw new Error('No org keypair. Create an org identity first.');
  }
  return getSignedHeaders(method, pathname(axiosPath), body, keypair);
}

/** Create org (signed). */
export const createOrg = async (name: string, slug: string): Promise<Org> => {
  const body = { name: name.trim(), slug: slug.toLowerCase().trim() };
  const headers = await withSignedHeaders('POST', '/v2/orgs', body);
  const response = await api.post<Org>('/v2/orgs', body, { headers });
  return response.data;
};

/** Update org (signed, admin). */
export const updateOrg = async (
  orgId: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
): Promise<Org> => {
  const body = { ...updates };
  const headers = await withSignedHeaders(
    'PATCH',
    `/v2/orgs/${encodeURIComponent(orgId)}`,
    body
  );
  const response = await api.patch<Org>(
    `/v2/orgs/${encodeURIComponent(orgId)}`,
    body,
    { headers }
  );
  return response.data;
};

/** Add member to org (signed, admin). */
export const addOrgMember = async (
  orgId: string,
  memberPubkey: string,
  role: 'admin' | 'member' = 'member'
): Promise<void> => {
  const body = { pubkey: memberPubkey.trim(), role };
  const headers = await withSignedHeaders(
    'POST',
    `/v2/orgs/${encodeURIComponent(orgId)}/members`,
    body
  );
  await api.post(
    `/v2/orgs/${encodeURIComponent(orgId)}/members`,
    body,
    { headers }
  );
};

/** Remove member from org (signed, admin). */
export const removeOrgMember = async (
  orgId: string,
  memberPubkey: string
): Promise<void> => {
  const headers = await withSignedHeaders(
    'DELETE',
    `/v2/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberPubkey)}`,
    null
  );
  await api.delete(
    `/v2/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberPubkey)}`,
    { headers }
  );
};

/** Link package to org (signed, admin). */
export const linkOrgPackage = async (
  orgId: string,
  packageName: string
): Promise<void> => {
  const body = { package: packageName.trim() };
  const headers = await withSignedHeaders(
    'POST',
    `/v2/orgs/${encodeURIComponent(orgId)}/packages`,
    body
  );
  await api.post(
    `/v2/orgs/${encodeURIComponent(orgId)}/packages`,
    body,
    { headers }
  );
};

/** Unlink package from org (signed, admin). */
export const unlinkOrgPackage = async (
  orgId: string,
  packageName: string
): Promise<void> => {
  const headers = await withSignedHeaders(
    'DELETE',
    `/v2/orgs/${encodeURIComponent(orgId)}/packages/${encodeURIComponent(packageName)}`,
    null
  );
  await api.delete(
    `/v2/orgs/${encodeURIComponent(orgId)}/packages/${encodeURIComponent(packageName)}`,
    { headers }
  );
};

/** Current org identity public key as base64url (for ?member= and UI). */
export const getMyOrgPubkeyBase64url = async (): Promise<string | null> => {
  const keypair = await getStoredKeypair();
  return keypair ? publicKeyToBase64url(keypair.publicKey) : null;
};
