import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  AppSummary,
  VersionInfo,
  AppManifest,
  DeveloperProfile,
  Attestation,
  ApiError,
  ClientConfig,
} from './types';

export class SSAppRegistryClient {
  private api: AxiosInstance;

  constructor(config: ClientConfig = {}) {
    this.api = axios.create({
      baseURL: config.baseURL || 'http://localhost:8082',
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // Error interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      error => {
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message,
          code: error.response?.data?.code,
          details: error.response?.data?.details,
        };
        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Get all applications with optional filtering
   */
  async getApps(params?: {
    dev?: string;
    name?: string;
  }): Promise<AppSummary[]> {
    const response = await this.api.get('/apps', { params });
    return response.data;
  }

  /**
   * Get all versions of a specific application
   */
  async getAppVersions(
    pubkey: string,
    appName: string
  ): Promise<VersionInfo[]> {
    const response = await this.api.get(`/apps/${pubkey}/${appName}`);
    return response.data;
  }

  /**
   * Get the manifest for a specific application version
   */
  async getAppManifest(
    pubkey: string,
    appName: string,
    semver: string
  ): Promise<AppManifest> {
    const response = await this.api.get(`/apps/${pubkey}/${appName}/${semver}`);
    return response.data;
  }

  /**
   * Get developer profile information
   */
  async getDeveloper(pubkey: string): Promise<DeveloperProfile> {
    const response = await this.api.get(`/developers/${pubkey}`);
    return response.data;
  }

  /**
   * Get attestation for a specific application version
   */
  async getAttestation(
    pubkey: string,
    appName: string,
    semver: string
  ): Promise<Attestation> {
    const response = await this.api.get(
      `/attestations/${pubkey}/${appName}/${semver}`
    );
    return response.data;
  }

  /**
   * Submit a new application manifest
   */
  async submitAppManifest(
    manifest: AppManifest
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post('/apps', manifest);
    return response.data;
  }

  /**
   * Submit developer profile information
   */
  async submitDeveloperProfile(
    pubkey: string,
    profile: DeveloperProfile
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post(`/developers/${pubkey}`, profile);
    return response.data;
  }

  /**
   * Submit an attestation for an application version
   */
  async submitAttestation(
    pubkey: string,
    appName: string,
    semver: string,
    attestation: Attestation
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post(
      `/attestations/${pubkey}/${appName}/${semver}`,
      attestation
    );
    return response.data;
  }

  /**
   * Check if the API is healthy
   */
  async healthCheck(): Promise<{ status: string }> {
    const response = await this.api.get('/healthz');
    return response.data;
  }
}
