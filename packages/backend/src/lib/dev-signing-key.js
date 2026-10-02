const multibase = require('multibase');
const { normalizeSignature } = require('./verify');

const DEV_SIGNING_PUBLIC_KEY = Buffer.from(
  '73bcb19ae0915df6f801be24725f4cdc3e65c5ca46f414d99bbb2633c8cc74c2',
  'hex'
);

function multibaseBytes(text) {
  try {
    return Buffer.from(multibase.decode(text));
  } catch {
    return null;
  }
}

function decodings(value) {
  const text = value.trim();
  const bare = text.startsWith('did:key:') ? text.slice(8) : text;
  const out = [];
  for (const candidate of new Set([text, bare])) {
    out.push(
      Buffer.from(candidate.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    );
    out.push(multibaseBytes(candidate), multibaseBytes(`z${candidate}`));
    if (/^[0-9a-fA-F]+$/.test(candidate)) {
      out.push(Buffer.from(candidate, 'hex'));
    }
  }
  return out
    .filter(Boolean)
    .flatMap(bytes =>
      bytes.length === 34 && bytes[0] === 0xed && bytes[1] === 0x01
        ? [bytes, bytes.subarray(2)]
        : [bytes]
    );
}

function isDevSigningKey(key) {
  if (typeof key !== 'string' || key.trim() === '') return false;
  return decodings(key).some(bytes => bytes.equals(DEV_SIGNING_PUBLIC_KEY));
}

function devSigningKeyRefusal(manifest) {
  const keys = [
    normalizeSignature(manifest?.signature)?.pubkey,
    manifest?.signerId,
    ...(Array.isArray(manifest?.owners) ? manifest.owners : []),
  ];
  if (!keys.some(isDevSigningKey)) return null;
  return {
    status: 400,
    body: {
      error: 'dev_signing_key',
      message:
        'This bundle is signed with, or lists as an owner, the shared development key from `--dev`, whose private key is public. Sign it with your own key: `cargo mero bundle --key <key-file>`.',
    },
  };
}

module.exports = {
  DEV_SIGNING_PUBLIC_KEY,
  isDevSigningKey,
  devSigningKeyRefusal,
};
