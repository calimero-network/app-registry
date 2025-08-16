import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSAppRegistryClient } from '../client';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    })),
  },
}));

describe('SSAppRegistryClient', () => {
  let client: SSAppRegistryClient;

  beforeEach(() => {
    client = new SSAppRegistryClient();
  });

  it('should create a client instance with default config', () => {
    expect(client).toBeInstanceOf(SSAppRegistryClient);
  });

  it('should create a client instance with custom config', () => {
    const customClient = new SSAppRegistryClient({
      baseURL: 'https://api.example.com',
      timeout: 5000,
    });
    expect(customClient).toBeInstanceOf(SSAppRegistryClient);
  });
});
