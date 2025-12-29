/**
 * Helper for Ed25519 in Jest tests
 * Handles ES module import for @noble/ed25519
 */

let ed25519Cache = null;

async function getEd25519() {
  if (!ed25519Cache) {
    ed25519Cache = await import('@noble/ed25519');
  }
  return ed25519Cache;
}

async function generateKeypair() {
  const ed25519 = await getEd25519();
  const privateKey = ed25519.ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

async function sign(data, privateKey) {
  const ed25519 = await getEd25519();
  return await ed25519.ed25519.sign(data, privateKey);
}

async function verify(signature, data, publicKey) {
  const ed25519 = await getEd25519();
  return await ed25519.ed25519.verify(signature, data, publicKey);
}

function pubkeyToBase64(publicKey) {
  return Buffer.from(publicKey).toString('base64');
}

function sigToBase64(signature) {
  return Buffer.from(signature).toString('base64');
}

module.exports = {
  getEd25519,
  generateKeypair,
  sign,
  verify,
  pubkeyToBase64,
  sigToBase64,
};
