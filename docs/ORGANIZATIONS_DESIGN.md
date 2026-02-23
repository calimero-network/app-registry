# Organizations and multi-author design

This document describes how package ownership and multiple authors work today, and a possible future Organization entity.

## Current model: `manifest.owners` only

- **Ownership** is the signer of the manifest (the key that produced the Ed25519 signature) or any public key listed in **`manifest.owners`** (array of base58 strings).
- Any key in `owners[]` can push new versions and PATCH metadata. There is no first-class “Organization” entity; no org id or org membership is stored in the registry.
- **Adding/removing owners**: Only an existing owner (signer or in `owners`) can change `owners` by editing the manifest and re-publishing (or PATCH). So only an existing owner can add or remove owners.

### Same key vs multiple keys

- **Same key (shared key)**: One keypair (e.g. CI or shared team key) is used by everyone. No `owners[]` needed; the single signer is the owner.
- **Multiple keys (`owners[]`)**: Each author has their own keypair. They list each other (or a team key) in `manifest.owners`. Any listed key can push/PATCH. No shared secret; each push is signed by whichever key is used (must be signer or in `owners`).

---

## Option A – Keep only `owners[]` (current; no new entity)

Treat `owners` as the “team” or “org” list: any key in the list can edit.

**Documentation:** “To work as a team, add teammates’ public keys to `manifest.owners`; each member signs with their own key when pushing.”

- **Pros**: No backend or schema change; already supported.
- **Cons**: No org name/avatar, no central “org membership” independent of per-package `owners`.

**Recommendation (short term):** Use Option A. Document `owners[]` as the way multiple authors coexist; backend already enforces owner-only edit everywhere (V2 API and Fastify push use `isAllowedOwner`).

---

## Option B – First-class Organization (future)

Add an **Organization** entity: id, name, optional metadata, and a list of member pubkeys (and optionally roles, e.g. admin vs member). Link packages to an org (e.g. `manifest.organization_id` or namespace → org).

**Edit rule:** “Allowed if signer or in `manifest.owners` **or** (if package is linked to an org) signer is a member of that org.”

Coexistence:

- **Same key**: Org can have a “bot” or “CI” member (one key used by automation).
- **Multiple keys**: Add each member’s pubkey to the org; any member can push (with their own key).
- **Shared key**: Add one shared key as org member; everyone uses that key to sign (same as today’s “same key” model).

Who can add/remove org members or change package↔org link would be defined by org roles (e.g. only org admin).

**Recommendation (later):** If you need org-level identity and membership, add Option B and extend the ownership check to “signer or in owners or org member.”
