'use strict';

/**
 * Manifest `metadata` keys only the registry writes.
 *
 * `author` is the owner's public name and `_`-prefixed keys are internal:
 * `_ownerEmail` decides ownership and the trusted-publisher shortcut,
 * `_adminVerified` is an admin's approval stamp. All of them sit inside the
 * publisher's signed manifest, so a signature says nothing about who set them;
 * whatever a publisher sends for them is dropped and the server's value used.
 */
const isServerKey = key => key === 'author' || key.startsWith('_');

/** `metadata` without any server-written key. */
function stripServerMetadata(metadata) {
  const out = { ...(metadata || {}) };
  for (const key of Object.keys(out)) {
    if (isServerKey(key)) delete out[key];
  }
  return out;
}

/**
 * Incoming publisher metadata with the server-written keys carried over from
 * the stored manifest, for edits that must not change them.
 */
function keepServerMetadata(incoming, stored) {
  const kept = {};
  for (const [key, value] of Object.entries(stored || {})) {
    if (isServerKey(key)) kept[key] = value;
  }
  return { ...stripServerMetadata(incoming), ...kept };
}

module.exports = { stripServerMetadata, keepServerMetadata };
