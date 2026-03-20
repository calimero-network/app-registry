import axios from 'axios';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
  Org,
  OrgMetadata,
  OrgMember,
  OrgPackageList,
  ApiToken,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return bundles.map((bundle: any) => {
    const author = bundle.metadata?.author || 'Unknown';
    const verified = !!bundle.verified;
    return {
      id: bundle.package,
      name: bundle.metadata?.name || bundle.package,
      package_name: bundle.package,
      developer_pubkey: author,
      latest_version: bundle.appVersion,
      alias: bundle.metadata?.name,
      downloads: bundle.downloads || 0,
      verified,
      developer: {
        display_name: author,
        pubkey: author,
        verified,
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
    const verified = !!bundle.verified;
    return {
      id: bundle.package,
      name: bundle.metadata?.name || bundle.package,
      package_name: bundle.package,
      developer_pubkey: author,
      latest_version: bundle.appVersion,
      alias: bundle.metadata?.name,
      downloads: bundle.downloads || 0,
      verified,
      developer: {
        display_name: author,
        pubkey: author,
        verified,
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

/** Delete a specific version of a package. Requires login as the package author. */
export const deleteBundleVersion = async (
  packageName: string,
  version: string
): Promise<void> => {
  await api.delete(
    `/v2/bundles/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`
  );
};

/** Delete an entire package (all versions). Requires login as the package author. */
export const deletePackage = async (packageName: string): Promise<void> => {
  await api.delete(`/v2/bundles/${encodeURIComponent(packageName)}`);
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

/** List orgs the given member (email) belongs to. */
export const getOrgsByMember = async (memberEmail: string): Promise<Org[]> => {
  if (!memberEmail?.trim()) return [];
  const response = await api.get<Org[]>('/v2/orgs', {
    params: { member: memberEmail.trim() },
  });
  return Array.isArray(response.data) ? response.data : [];
};

/** Get the org that owns a package (reverse lookup). Returns null if unlinked. */
export const getOrgByPackage = async (
  packageName: string
): Promise<Org | null> => {
  if (!packageName?.trim()) return null;
  const response = await api.get<Org | null>('/v2/orgs', {
    params: { package: packageName.trim() },
  });
  return response.data ?? null;
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
    packages: Array.isArray(response.data?.packages)
      ? response.data.packages
      : [],
  };
};

// ——— Org write operations (session cookie auth — sent automatically via withCredentials) ———

/** Create org. Requires Google login. Creator becomes first admin. */
export const createOrg = async (name: string, slug: string): Promise<Org> => {
  const response = await api.post<Org>('/v2/orgs', {
    name: name.trim(),
    slug: slug.toLowerCase().trim(),
  });
  return response.data;
};

/** Update org (admin only). */
export const updateOrg = async (
  orgId: string,
  updates: { name?: string; metadata?: OrgMetadata }
): Promise<Org> => {
  const response = await api.patch<Org>(
    `/v2/orgs/${encodeURIComponent(orgId)}`,
    updates
  );
  return response.data;
};

/** Add member to org by email (admin only). */
export const addOrgMember = async (
  orgId: string,
  email: string,
  role: 'admin' | 'member' = 'member'
): Promise<void> => {
  await api.post(`/v2/orgs/${encodeURIComponent(orgId)}/members`, {
    email: email.trim(),
    role,
  });
};

/** Remove member from org (admin only). */
export const removeOrgMember = async (
  orgId: string,
  memberEmail: string
): Promise<void> => {
  await api.delete(
    `/v2/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberEmail)}`
  );
};

/** Link package to org (admin only; must be package author). */
export const linkOrgPackage = async (
  orgId: string,
  packageName: string
): Promise<void> => {
  await api.post(`/v2/orgs/${encodeURIComponent(orgId)}/packages`, {
    package: packageName.trim(),
  });
};

/** Unlink package from org (admin only). */
export const unlinkOrgPackage = async (
  orgId: string,
  packageName: string
): Promise<void> => {
  await api.delete(
    `/v2/orgs/${encodeURIComponent(orgId)}/packages/${encodeURIComponent(packageName)}`
  );
};

/** Delete an org and all its data (admin only). */
export const deleteOrg = async (orgId: string): Promise<void> => {
  await api.delete(`/v2/orgs/${encodeURIComponent(orgId)}`);
};

// ——— API Tokens ———

/** Create a new API token for CLI use. Returns full token (shown only once). */
export const createApiToken = async (
  label?: string
): Promise<{ token: string; label: string; createdAt: string }> => {
  const response = await api.post<{
    token: string;
    label: string;
    createdAt: string;
  }>('/auth/token', { label: label || 'CLI token' });
  return response.data;
};

/** List existing API tokens (masked). */
export const listApiTokens = async (): Promise<ApiToken[]> => {
  const response = await api.get<{ tokens: ApiToken[] }>('/auth/tokens');
  return Array.isArray(response.data?.tokens) ? response.data.tokens : [];
};

/** Revoke an API token by its tokenId (first 8 chars). */
export const revokeApiToken = async (tokenId: string): Promise<void> => {
  await api.delete(`/auth/token/${encodeURIComponent(tokenId)}`);
};

/** Claim a username for the currently logged-in user. Can only be done once. */
export const claimUsername = async (
  username: string
): Promise<{ username: string }> => {
  const response = await api.post<{ username: string }>('/auth/username', {
    username,
  });
  return response.data;
};

/** Batch-resolve emails to { username, verified }. Returns a map keyed by email. */
export const resolveUsers = async (
  emails: string[]
): Promise<Record<string, { username: string | null; verified: boolean }>> => {
  if (!emails.length) return {};
  const response = await api.get<
    Record<string, { username: string | null; verified: boolean }>
  >('/users/resolve', {
    params: { emails: emails.join(',') },
  });
  return response.data ?? {};
};
