/**
 * One Redis client per function instance.
 *
 * api/lib/kv-client.js used to be its own implementation, and the bundle
 * detail route built a third client inline. A function that read through more
 * than one of them held one connection each and paid a TLS connect per client
 * on every cold start; in development each was a separate in-memory store, so
 * the detail route answered 404 for a bundle the bundle store had just written.
 */

jest.mock('../../../api/lib/auth-helpers', () => ({
  ...jest.requireActual('../../../api/lib/auth-helpers'),
  resolveUser: async () => null,
}));

const { kv: backendKv } = require('../src/lib/kv-client');
const { kv: apiKv } = require('../../../api/lib/kv-client');
const detailHandler = require('../../../api/v2/bundles/[package]/[version]');

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

beforeEach(async () => {
  await backendKv._clear();
});

test('the serverless routes and the bundle store share one client', () => {
  expect(apiKv).toBe(backendKv);
});

test('the detail route reads the store the bundle was written to', async () => {
  await backendKv.set(
    'bundle:com.example.app/1.0.0',
    JSON.stringify({
      json: {
        package: 'com.example.app',
        appVersion: '1.0.0',
        metadata: { name: 'App' },
      },
    })
  );
  const res = makeRes();
  await detailHandler(
    {
      method: 'GET',
      headers: {},
      query: { package: 'com.example.app', version: '1.0.0' },
    },
    res
  );

  expect(res.statusCode).toBe(200);
  expect(res.body.package).toBe('com.example.app');
});
