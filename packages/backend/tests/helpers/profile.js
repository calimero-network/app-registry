/**
 * Writes the profile login creates, which a Bearer token's owner must have.
 */

function seedProfile(store, email) {
  const key = `email2user:${email.toLowerCase()}`;
  if (store.has(key)) return;
  store.set(key, `u-${email}`);
  store.set(`user:u-${email}`, JSON.stringify({ id: `u-${email}`, email }));
}

module.exports = { seedProfile };
