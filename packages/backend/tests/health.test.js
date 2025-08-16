const { buildServer } = require('../src/server');

describe('Health endpoint', () => {
  test('should return 200 with status ok', async () => {
    const server = await buildServer();

    const response = await server.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ status: 'ok' });

    await server.close();
  });
});
