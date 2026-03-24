/**
 * Convert a Redis SCAN-style glob into a RegExp.
 * Supports:
 * - * => zero or more characters
 * - ? => exactly one character
 */
function globToRegex(pattern) {
  return new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`
  );
}

module.exports = { globToRegex };
