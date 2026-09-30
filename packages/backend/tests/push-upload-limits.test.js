const { Readable } = require('stream');

jest.mock('../src/lib/kv-client', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    sAdd: jest.fn(),
    sMembers: jest.fn(),
  },
}));
jest.mock('../../../api/lib/kv-client', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    sAdd: jest.fn(),
    sMembers: jest.fn(),
  },
}));
jest.mock('../../../api/lib/auth-helpers', () => ({
  resolveUser: jest.fn().mockResolvedValue({ email: 'dev@example.com' }),
  LOGIN_REQUIRED: { error: 'unauthorized', message: 'Login required' },
}));

const pushHandler = require('../../../api/v2/bundles/push');
const pushFileHandler = require('../../../api/v2/bundles/push-file');
const { parseMultipart, MAX_BUNDLE_BYTES } = pushFileHandler;

function makeRes() {
  return {
    statusCode: null,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

const BOUNDARY = 'testboundary';

function multipartReq(files) {
  const parts = files.map(({ name, content }) =>
    Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="bundle"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      ),
      content,
      Buffer.from('\r\n'),
    ])
  );
  const body = Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`)]);
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = {
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    'content-length': String(body.length),
  };
  return req;
}

describe('upload size limits', () => {
  it('push.js refuses an oversized declared body before reading it', async () => {
    const req = {
      method: 'POST',
      headers: { 'content-length': String(500 * 1024 * 1024) },
    };
    Object.defineProperty(req, 'body', {
      get() {
        throw new Error('body must not be read');
      },
    });
    const res = makeRes();
    await pushHandler(req, res);
    expect(res.statusCode).toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });

  it('push-file refuses an oversized declared body before parsing it', async () => {
    const req = multipartReq([{ name: 'b.mpk', content: Buffer.from('x') }]);
    req.headers['content-length'] = String(MAX_BUNDLE_BYTES + 2 * 1024 * 1024);
    req.pipe = () => {
      throw new Error('body must not be read');
    };
    const res = makeRes();
    await pushFileHandler(req, res);
    expect(res.statusCode).toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });

  it('refuses a file over the limit instead of accepting a truncated copy', async () => {
    const req = multipartReq([
      { name: 'b.mpk', content: Buffer.alloc(2048, 1) },
    ]);
    await expect(parseMultipart(req, 1024)).rejects.toMatchObject({
      status: 413,
      code: 'payload_too_large',
    });
  });

  it('refuses a file one byte over the limit', async () => {
    const req = multipartReq([
      { name: 'b.mpk', content: Buffer.alloc(1025, 1) },
    ]);
    await expect(parseMultipart(req, 1024)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('accepts a file within the limit whole', async () => {
    const content = Buffer.alloc(1024, 7);
    const req = multipartReq([{ name: 'b.mpk', content }]);
    const { buffer, filename } = await parseMultipart(req, 1024);
    expect(filename).toBe('b.mpk');
    expect(buffer.equals(content)).toBe(true);
  });

  it('reads only the first file', async () => {
    const first = Buffer.from('first');
    const req = multipartReq([
      { name: 'a.mpk', content: first },
      { name: 'b.mpk', content: Buffer.from('second') },
    ]);
    const { buffer, filename } = await parseMultipart(req, 1024);
    expect(filename).toBe('a.mpk');
    expect(buffer.equals(first)).toBe(true);
  });
});
