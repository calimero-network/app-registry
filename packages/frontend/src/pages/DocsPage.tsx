import { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  ExternalLink,
  Terminal,
  Key,
  Package,
  Building2,
  Shield,
  Upload,
  GitBranch,
} from 'lucide-react';

const SECTIONS = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'bundles', label: 'Bundles & Manifests' },
  { id: 'cargo-mero', label: 'cargo mero' },
  { id: 'signing', label: 'Signing & Identity' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'ci', label: 'Publishing from CI' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'registry-cli', label: 'Registry CLI' },
  { id: 'installation-validation', label: 'Install & Validation' },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className='text-[11px] text-brand-600 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 font-mono'>
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className='text-[11.5px] text-neutral-300 bg-neutral-950 border border-white/[0.06] rounded-lg p-4 overflow-x-auto font-mono leading-relaxed'>
      {children}
    </pre>
  );
}

function Diagram({ children }: { children: string }) {
  return (
    <pre className='text-[10.5px] text-brand-600/70 bg-neutral-950 border border-brand-900/30 rounded-lg p-5 overflow-x-auto font-mono leading-loose'>
      {children}
    </pre>
  );
}

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className='text-xl font-semibold text-neutral-100 mb-5 scroll-mt-24'
    >
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className='text-[14px] font-semibold text-neutral-200 mt-8 mb-3'>
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-[13px] text-neutral-400 font-light leading-relaxed'>
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className='rounded-lg border border-brand-600/20 bg-brand-950/20 px-4 py-3 text-[12px] text-neutral-300 font-light leading-relaxed'>
      {children}
    </div>
  );
}

function Steps({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <ol className='space-y-3 list-none'>
      {items.map(([step, desc], i) => (
        <li key={i} className='flex gap-3'>
          <span className='flex-shrink-0 w-5 h-5 rounded-full bg-brand-600/20 text-brand-600 text-[10px] font-bold flex items-center justify-center mt-0.5'>
            {i + 1}
          </span>
          <div className='text-[13px] text-neutral-400 font-light leading-relaxed'>
            <span className='text-neutral-200 font-medium'>{step}: </span>
            <span>{desc}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * `width` sizes the label column and must carry its own `sm:` prefix: Tailwind
 * scans source text, so a prefix built at runtime would never be generated.
 * Below that breakpoint the row stacks, which keeps long keys like
 * CALIMERO_REGISTRY_API_KEY from squeezing the description into a sliver.
 */
function FieldList({
  rows,
  width,
}: {
  rows: [string, string][];
  width: string;
}) {
  return (
    <div className='rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3'>
      {rows.map(([field, desc]) => (
        <div
          key={field}
          className='flex flex-col sm:flex-row gap-0.5 sm:gap-3 text-[12px]'
        >
          <span
            className={`text-brand-600 font-mono ${width} flex-shrink-0 break-words`}
          >
            {field}
          </span>
          <span className='text-neutral-400 font-light'>{desc}</span>
        </div>
      ))}
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className='flex gap-10'>
      {/* ── Sidebar ── */}
      <aside className='hidden lg:block w-48 flex-shrink-0 animate-slide-in-left'>
        <nav className='sticky top-20'>
          <p className='section-heading mb-3'>On this page</p>
          <ul className='space-y-0.5'>
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={`block px-3 py-1.5 rounded-md text-[12px] transition-colors ${
                    activeSection === id
                      ? 'bg-white/[0.06] text-brand-600 font-medium'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]'
                  }`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className='mt-5 pt-4 border-t border-white/[0.06]'>
            <a
              href='https://docs.calimero.network'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
            >
              <ExternalLink className='w-3 h-3 flex-shrink-0' />
              Official Docs
            </a>
          </div>
        </nav>
      </aside>

      {/* ── Content ── */}
      <div className='flex-1 min-w-0 space-y-16 pb-16 animate-fade-in'>
        {/* ══════════════════════════════════════════
            INTRODUCTION
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='introduction'>Introduction</SectionHeading>
          <div className='space-y-4'>
            <P>
              The{' '}
              <strong className='text-neutral-200'>Calimero Registry</strong> is
              a self-sovereign application registry for publishing, discovering,
              and managing WebAssembly applications that run inside Calimero
              nodes. Every app is a{' '}
              <strong className='text-neutral-200'>
                cryptographically signed bundle
              </strong>
              . The registry records who published it, and any consumer can
              verify its authenticity independently.
            </P>
            <Diagram>{`
  Developer                        Registry                        Node
      │                               │                              │
      │  cargo mero build             │                              │
      │  cargo mero bundle --key ...  │  (compiles, signs, packs)    │
      │                               │                              │
      │──── cargo mero publish ──────▶│                              │
      │                               │  verify Ed25519 signature    │
      │                               │  check signer owns package   │
      │                               │  store manifest + binary     │
      │                               │                              │
      │                               │◀──── browse / search ────────│
      │                               │───── download .mpk ─────────▶│
      │                               │                              │  verify signature
      │                               │                              │  mount WASM ✓
`}</Diagram>
            <P>
              Building and publishing an app is the job of one tool,{' '}
              <Code>cargo mero</Code>. These are the pieces you will touch:
            </P>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2'>
              {[
                {
                  icon: Terminal,
                  title: 'cargo mero',
                  desc: 'The app toolchain. Scaffolds, compiles to WASM, runs tests, signs and packs the .mpk, and publishes it here.',
                },
                {
                  icon: Package,
                  title: 'Registry API',
                  desc: 'Validates every Ed25519 signature on upload, pins the signer per package, and serves manifests and binaries.',
                },
                {
                  icon: BookOpen,
                  title: 'Web UI',
                  desc: 'The site you are on now. Browse apps, upload a .mpk by hand, manage organizations and API tokens.',
                },
                {
                  icon: GitBranch,
                  title: 'calimero-registry CLI',
                  desc: 'Organization administration and metadata edits from the terminal. Publishing lives in cargo mero.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className='card p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <Icon className='w-3.5 h-3.5 text-brand-600' />
                    <span className='text-[13px] font-medium text-neutral-200'>
                      {title}
                    </span>
                  </div>
                  <p className='text-[12px] text-neutral-500 font-light'>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
            <Note>
              <strong>Coming from the old flow?</strong> Hand-rolled{' '}
              <Code>build.sh</Code> scripts, standalone <Code>mero-sign</Code>,
              and <Code>calimero-registry bundle create</Code> /{' '}
              <Code>bundle push</Code> are all replaced by{' '}
              <Code>cargo mero</Code>. Key generation and signing are still
              available as <Code>cargo mero key</Code> and{' '}
              <Code>cargo mero sign</Code>, so nothing you signed before stops
              verifying.
            </Note>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            BUNDLES & MANIFESTS
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='bundles'>Bundles & Manifests</SectionHeading>
          <div className='space-y-4'>
            <P>
              A Calimero app ships as an <Code>.mpk</Code> file: a
              gzip-compressed tar archive holding a signed{' '}
              <Code>manifest.json</Code> alongside the compiled WebAssembly and
              its ABI.
            </P>

            <SubHeading>Bundle layout</SubHeading>
            <P>
              A single-service app puts the wasm at the archive root. A
              workspace that ships several services puts each one under{' '}
              <Code>services/</Code>:
            </P>
            <CodeBlock>{`single service                    multi-service workspace
──────────────                    ───────────────────────
bundle.mpk  (tar.gz)              bundle.mpk  (tar.gz)
├── manifest.json                 ├── manifest.json
├── app.wasm                      └── services/
└── abi.json                          ├── registry.wasm
                                      ├── registry-abi.json
                                      ├── docs.wasm
                                      └── docs-abi.json`}</CodeBlock>
            <P>
              Every service carries its own ABI. The ABI is also embedded inside
              the wasm itself, as the <Code>calimero_abi_v1</Code> custom
              section, which is what the node reads when it plans a state
              migration on upgrade.
            </P>

            <SubHeading>Manifest structure</SubHeading>
            <P>
              The manifest describes the app and carries the signature that
              proves who published it. This is a real published manifest, with
              the icon and signature truncated for readability:
            </P>
            <CodeBlock>{`{
  "version":    "1.0",                    // manifest schema version, always 1.0
  "package":    "com.calimero.mero-ar",   // reverse-domain app id, immutable
  "appVersion": "0.0.1",                  // semver, one manifest per version
  "minRuntimeVersion": "0.1.0",

  "metadata": {
    "name":        "Mero AR",
    "description": "Collaborative spatial editing on the Calimero p2p network.",
    "author":      "calimero-network",    // set by the registry, not by you
    "icon":        "data:image/png;base64,iVBORw0KG...",
    "tags":        ["ar", "spatial", "collaboration"],
    "license":     "MIT"
  },

  "handlers": {
    "slug": "com.calimero.mero-ar"        // deep-link slug: calimero://<slug>/...
  },

  "wasm": {
    "path": "app.wasm",
    "hash": "ae336ad491221ac052bb970afb5f65d4041196a8a882e707f3871c9d9ce11ac2",
    "size": 581445
  },

  "abi": {
    "path": "abi.json",
    "hash": "85b47844e0ccced114385c07ea41a2b3e9b494b6e76fe26332d6d09379f97109",
    "size": 14824
  },

  "links": {
    "frontend": "https://my-app.example.com",
    "github":   "https://github.com/calimero-network/mero-ar",
    "docs":     "https://docs.calimero.network"
  },

  "signerId": "did:key:z6MkoWkrrFjwC4FXQfyGwwcgTPvRoJZenMEVm9Z332bdkz6B",
  "signature": {
    "algorithm": "ed25519",
    "publicKey": "hp6BeiDHt5vg-Bk7-RlRMAovynWBRH_BX9i_UZ6hxag",
    "signature": "QKx67a5piF9aHk4Ze_1Nj8sb..."
  }
}`}</CodeBlock>
            <P>
              A multi-service bundle replaces the top-level <Code>wasm</Code>{' '}
              and <Code>abi</Code> with a <Code>services</Code> array, one entry
              per service:
            </P>
            <CodeBlock>{`"services": [
  {
    "name": "registry",
    "wasm": { "path": "services/registry.wasm",      "hash": "97169f2c...", "size": 540776 },
    "abi":  { "path": "services/registry-abi.json",  "hash": "15b3ea5d...", "size": 15997 }
  },
  {
    "name": "docs",
    "wasm": { "path": "services/docs.wasm",          "hash": "7dd3e291...", "size": 504910 },
    "abi":  { "path": "services/docs-abi.json",      "hash": "743fd306...", "size": 13444 }
  }
]`}</CodeBlock>
            <Note>
              <strong>Immutable after publish:</strong> <Code>package</Code>,{' '}
              <Code>appVersion</Code>, and every <Code>wasm</Code> /{' '}
              <Code>abi</Code> hash. <Code>metadata.author</Code> is set by the
              registry from the account that first published the package and is
              carried forward onto every later version, so it cannot be
              rewritten by editing a manifest. Only <Code>metadata.name</Code>,{' '}
              <Code>metadata.description</Code>, and <Code>links</Code> are
              editable after publishing.
            </Note>

            <SubHeading>Where the metadata comes from</SubHeading>
            <P>
              You do not hand-write <Code>manifest.json</Code>.{' '}
              <Code>cargo mero bundle</Code> generates it from a{' '}
              <Code>[package.metadata.calimero]</Code> table in your app&apos;s{' '}
              <Code>Cargo.toml</Code> (or{' '}
              <Code>[workspace.metadata.calimero]</Code> for a multi-service
              workspace, which wins when both are present):
            </P>
            <CodeBlock>{`[package.metadata.calimero]
package = "com.example.my-app"          # required, the app id
name = "My App"
description = "A collaborative example app"
icon = "assets/icon.png"                # embedded as a data: URI at bundle time
license = "MIT"
tags = ["social", "chat"]
min-runtime-version = "0.7.0"
frontend = "https://my-app.example.com"
github = "https://github.com/example/my-app"`}</CodeBlock>
            <FieldList
              width='sm:w-40'
              rows={[
                [
                  'package',
                  'Reverse-domain app id. Required, no default. The first publish claims it.',
                ],
                [
                  'icon',
                  'Filesystem path to a PNG, resolved relative to the table that declares it. Required unless you pass --no-icon; icon = "default" selects the bundled Calimero mark.',
                ],
                [
                  'slug',
                  'Deep-link handler slug (calimero://<slug>/...). Defaults to the package id.',
                ],
                [
                  'services',
                  'Workspace table only. Maps each bundled service name to the crate that builds it.',
                ],
                [
                  'appVersion',
                  'Not a metadata key. Defaults to the crate’s [package] version; override with --app-version or --bump.',
                ],
              ]}
            />

            <SubHeading>Package naming</SubHeading>
            <P>
              Package ids follow reverse-domain notation:{' '}
              <Code>com.myorg.myapp</Code>. Lowercase letters, numbers, dots,
              and hyphens only. The first publish of a package id claims it, and
              from then on the registry only accepts versions signed by the same
              key.
            </P>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CARGO MERO
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='cargo-mero'>cargo mero</SectionHeading>
          <div className='space-y-4'>
            <P>
              <strong className='text-neutral-200'>cargo mero</strong> is the
              toolchain for Calimero apps. It covers the whole path from an
              empty directory to a published bundle, and replaces the
              hand-written build and packaging scripts apps used to carry.
            </P>

            <SubHeading>Installation</SubHeading>
            <CodeBlock>{`# cargo mero is a cargo subcommand: install the binary, cargo finds it
cargo install --git https://github.com/calimero-network/core cargo-mero

# the build step targets wasm32 (cargo mero build auto-installs it via rustup)
rustup target add wasm32-unknown-unknown`}</CodeBlock>
            <P>
              Prebuilt binaries are attached to each{' '}
              <a
                href='https://github.com/calimero-network/core/releases'
                target='_blank'
                rel='noopener noreferrer'
                className='text-brand-600 hover:text-brand-500'
              >
                core release
              </a>
              . CI should install a pinned one rather than build from git; see{' '}
              <a href='#ci' className='text-brand-600 hover:text-brand-500'>
                Publishing from CI
              </a>
              .
            </P>

            <SubHeading>The workflow</SubHeading>
            <P>
              Five steps, start to finish. <Code>cargo mero guide</Code> prints
              this same list at any time.
            </P>
            <CodeBlock>{`cargo mero new my-app        # 1. scaffold (state, events, logic, tests)
cargo mero build             # 2. compile -> wasm-opt -> embed ABI (res/my_app.wasm)
cargo mero test              # 3. run the node-free test suite
cargo mero bundle --key k.json   # 4. build all services, write + sign manifest, pack .mpk
cargo mero publish dist/com.example.my-app-1.0.0.mpk   # 5. push to the registry`}</CodeBlock>
            <FieldList
              width='sm:w-24'
              rows={[
                [
                  'new',
                  'Scaffolds a crate: Cargo.toml with the SDK pins and app id, a lib.rs with state, events, logic and a TestHost test, and a convergence test. No build.rs needed.',
                ],
                [
                  'build',
                  'Compiles to wasm32-unknown-unknown, size-optimizes with wasm-opt -Oz on release, and embeds the canonical ABI as the calimero_abi_v1 wasm section. Writes res/<name>.wasm, res/abi.json, res/state-schema.json.',
                ],
                [
                  'test',
                  'Runs the in-crate TestHost unit tests plus the convergence tests. No node and no network required.',
                ],
                [
                  'bundle',
                  'Builds every service, writes manifest.json, signs it, and packs a tar.gz .mpk at dist/<package>-<appVersion>.mpk.',
                ],
                [
                  'publish',
                  'Uploads a signed .mpk to the registry. Needs CALIMERO_API_KEY.',
                ],
              ]}
            />

            <SubHeading>Useful bundle flags</SubHeading>
            <CodeBlock>{`--key <file>          sign with a production key (required to publish)
--dev                 sign with the well-known dev key (local only, registry refuses it)
--app-version <v>     override the version recorded in the manifest
--bump patch|minor|major   ask the registry for the highest published version and bump it
--package <id>        override the manifest package id
-o, --output <path>   override dist/<package>-<appVersion>.mpk
--no-abi              omit the ABI; the bundle cannot be migrated
--no-icon             ship without an icon (fine when links.frontend serves a PWA icon)
--print-output-path   print the built .mpk path as the last line, for scripts
--features "a b"      cargo feature flags, forwarded to the build and the ABI extraction`}</CodeBlock>
            <Note>
              <Code>--bump</Code> resolves the next version against{' '}
              <strong>the registry</strong>, not your working tree, so it is
              correct even after a revert or a squashed merge. It cannot be
              combined with <Code>--app-version</Code>.
            </Note>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            SIGNING & IDENTITY
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='signing'>Signing & Identity</SectionHeading>
          <div className='space-y-4'>
            <P>
              Every <Code>.mpk</Code> carries an Ed25519 signature over its{' '}
              <Code>manifest.json</Code>. The signature is not only tamper
              protection: together with the package id it{' '}
              <strong className='text-neutral-200'>
                determines the app&apos;s identity on every node
              </strong>
              , which is why the key you sign with matters more than it might
              first appear.
            </P>

            <SubHeading>Dev key vs production key</SubHeading>
            <FieldList
              width='sm:w-24'
              rows={[
                [
                  '--dev',
                  'A single well-known key baked into the tool, derived from a fixed seed, so every --dev bundle everywhere shares one signer. The analogue of Android’s debug.keystore: fine for local installs, proves nothing about provenance. The registry refuses it.',
                ],
                [
                  '--key',
                  'A private Ed25519 key only you hold. Required for anything published here. Generate with cargo mero key generate.',
                ],
              ]}
            />

            <SubHeading>Generating a key</SubHeading>
            <CodeBlock>{`cargo mero key generate -o my-key.json
# Generated new keypair: my-key.json
#   signerId: did:key:z6MkrV2imerTHzYtPyb2groFVNJSokGX7rpxnuJj8DSEQDnH

# inspect an existing key without signing anything
cargo mero key derive-signer-id -k my-key.json`}</CodeBlock>
            <P>
              The file holds the base64url-encoded private-key seed, the public
              key, and the derived <Code>signerId</Code>. The private key is a
              credential: keep it out of the repository, and inject it in CI
              rather than committing it.
            </P>
            <Note>
              <strong>Back the key up.</strong> Losing it means you can no
              longer publish updates under the same app identity, and there is
              no recovery path. See below for why.
            </Note>

            <SubHeading>From public key to signerId</SubHeading>
            <P>
              A signer is identified by a <Code>did:key</Code> string derived
              from the public key, not by the raw key. Nodes recompute it from
              the signature&apos;s embedded public key, so a forged{' '}
              <Code>signerId</Code> field is rejected.
            </P>
            <Diagram>{`  32-byte Ed25519 public key
        │
        ▼  prefix with the ed25519-pub multicodec indicator (0xed01)
        │
        ▼  base58btc encode
        │
        ▼  prepend the multibase 'z' marker and the did:key: scheme
        │
        ▼  did:key:z6MkoWkrrFjwC4FXQfyGwwcgTPvRoJZenMEVm9Z332bdkz6B`}</Diagram>

            <SubHeading>Why the signer is pinned per package</SubHeading>
            <P>
              A node does not hash the wasm to identify an app. It derives the{' '}
              <Code>ApplicationId</Code> from the manifest&apos;s{' '}
              <Code>package</Code> and the bundle&apos;s <Code>signerId</Code>:
            </P>
            <Diagram>{`  ApplicationId = SHA-256( borsh( package, signerId ) )

  com.example.my-app  +  did:key:z6MkrV2...   →  ApplicationId  A
  com.example.my-app  +  did:key:z6MkoWk...   →  ApplicationId  B   (a different app!)`}</Diagram>
            <P>
              Publishing the same package under a different key does not produce
              an upgrade. It produces a{' '}
              <strong className='text-neutral-200'>
                different application
              </strong>
              , and existing installs never see it. The registry therefore
              refuses a version whose signer does not match the one that
              published the package, rather than letting the identity break
              silently.
            </P>

            <SubHeading>How signing works</SubHeading>
            <Diagram>{`  manifest.json  (signature field absent or empty)
         │
         ▼  Remove signature + all _* prefixed fields
         │
         ▼  RFC 8785 JSON Canonicalization
         │  (sorts all object keys recursively → deterministic bytes)
         │
         ▼  SHA-256 hash of canonical bytes
         │
         ▼  Ed25519 sign(hash, private_key)
         │
         ▼  Inject the signature block and the derived signerId:
            "signerId": "did:key:z6Mk...",
            "signature": {
              "algorithm": "ed25519",
              "publicKey": "base64url-32-bytes",
              "signature": "base64url-64-bytes"
            }`}</Diagram>
            <P>
              <Code>cargo mero bundle</Code> does this as part of packaging.{' '}
              <Code>cargo mero sign</Code> does it to an existing{' '}
              <Code>manifest.json</Code> in place, which is what a metadata edit
              needs. The registry re-runs the exact same process on every
              upload; a mismatch returns <Code>400 invalid_signature</Code>.
            </P>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            PUBLISHING
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='publishing'>Publishing</SectionHeading>
          <div className='space-y-4'>
            <SubHeading>Getting an API token</SubHeading>
            <Steps
              items={[
                [
                  'Sign in',
                  'Click "Sign in" in the header and authenticate with Google. Your account is what the registry attributes the publish to.',
                ],
                [
                  'Open Organizations',
                  <>
                    Open{' '}
                    <strong className='text-neutral-200'>Organizations</strong>{' '}
                    from the header dropdown and expand the{' '}
                    <strong className='text-neutral-200'>CLI Access</strong>{' '}
                    section.
                  </>,
                ],
                [
                  'Generate a token',
                  <>
                    Click "Generate token" and copy it. It is shown once. Export
                    it where you publish from:
                    <CodeBlock>{`export CALIMERO_API_KEY=<token>`}</CodeBlock>
                  </>,
                ],
              ]}
            />

            <SubHeading>Publishing from the terminal</SubHeading>
            <CodeBlock>{`# 1. build and sign, taking the next patch version from the registry
cargo mero bundle --key my-key.json --bump patch
# → dist/com.example.my-app-1.2.4.mpk

# 2. publish
export CALIMERO_API_KEY=<token>
cargo mero publish dist/com.example.my-app-1.2.4.mpk`}</CodeBlock>
            <P>
              The registry defaults to{' '}
              <Code>https://apps.calimero.network</Code>. Point at another one
              with <Code>CALIMERO_REGISTRY_URL</Code>.
            </P>

            <SubHeading>What the registry checks</SubHeading>
            <FieldList
              width='sm:w-28'
              rows={[
                [
                  'Signature',
                  'The manifest must carry a valid Ed25519 signature. The whole .mpk rides along under a _binary field, and _-prefixed keys are stripped before verification, so attaching it does not disturb what was signed.',
                ],
                [
                  'Dev key',
                  'A bundle signed with the well-known dev key is refused. Publishing requires a key only you hold.',
                ],
                [
                  'Ownership',
                  'For an existing package, the signing key must match the one that published it. Otherwise: 403 not_owner.',
                ],
                [
                  'owners[]',
                  'A manifest can also list additional owner keys, which the endpoint honours. cargo mero never writes the field and no published manifest carries one, and it would not help if it did: ApplicationId comes from package + signerId, so a second owner publishes a different application rather than a new version. That is why the CI step above compares the signer directly and refuses a mismatch.',
                ],
                [
                  'Author',
                  'metadata.author is taken from your account on first publish and carried forward from the oldest version on every later one. A manifest cannot set it.',
                ],
              ]}
            />

            <SubHeading>Uploading from the browser</SubHeading>
            <P>
              A signed <Code>.mpk</Code> can also be published without a token.
              Sign in, open <strong className='text-neutral-200'>Upload</strong>{' '}
              in the top nav, and drop the file in. The browser upload
              authenticates with your session instead of an API key, and it
              accepts{' '}
              <strong className='text-neutral-200'>org membership</strong> in
              place of a key match: if the package is linked to an org you
              belong to, your own signing key is enough.
            </P>
            <Note>
              <Upload className='inline w-3.5 h-3.5 text-brand-600 mr-1 -mt-0.5' />
              The browser upload also refuses a version that is not greater than
              the latest published one. <Code>cargo mero publish</Code> leaves
              version ordering to you, so prefer <Code>--bump</Code> over
              hand-picking a number.
            </Note>

            <SubHeading>Editing published metadata</SubHeading>
            <P>
              Name, description, and links stay editable after publishing. The
              edit is still a signed manifest, so it is a three-step flow:
            </P>
            <CodeBlock>{`# 1. fetch the current manifest with your changes applied
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \\
  --name "New Name" --description "Updated description" -o manifest.json

# 2. sign it
cargo mero sign manifest.json --key my-key.json

# 3. PATCH it back
calimero-registry bundle edit com.example.my-app 1.2.4 --remote \\
  --manifest manifest.json`}</CodeBlock>
            <P>
              The same flow is available from the app page in the UI: the pencil
              icon next to the version pill opens the edit form and hands you
              the unsigned manifest to sign.
            </P>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            PUBLISHING FROM CI
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='ci'>Publishing from CI</SectionHeading>
          <div className='space-y-4'>
            <P>
              Releasing by hand means someone has to remember to do it, with the
              production key on their laptop. The pattern below, used by the
              Calimero apps today, makes{' '}
              <strong className='text-neutral-200'>
                bumping the version in <Code>Cargo.toml</Code> the release
              </strong>
              : merge that to your default branch and CI builds, signs, and
              publishes.
            </P>

            <SubHeading>Secrets</SubHeading>
            <P>
              Set these as{' '}
              <strong className='text-neutral-200'>organization secrets</strong>{' '}
              so every app repo inherits them, rather than copying a key into
              each one:
            </P>
            <FieldList
              width='sm:w-52'
              rows={[
                [
                  'MERO_SIGN_KEY',
                  'The full JSON of the production key file. Must be the key that signed the package’s first version, since the registry pins the signer.',
                ],
                [
                  'CALIMERO_REGISTRY_API_KEY',
                  'An API token from the Organizations page, CLI Access section. A dedicated bot account keeps releases off a person’s credentials.',
                ],
              ]}
            />

            <SubHeading>The workflow</SubHeading>
            <P>
              Two jobs. A cheap gate decides whether there is anything to
              publish, so an unrelated edit to <Code>Cargo.toml</Code> does not
              pay for a Rust build before deciding to do nothing.
            </P>
            <Diagram>{`  push to master touching logic/Cargo.toml
        │
        ▼  read [workspace.package] version + the calimero package id
        │
        ▼  GET /api/v2/bundles/<package>/<version>
        │     404 → publish        200 → already released, stop
        │     anything else → fail (never republish on a blind guess)
        │
        ▼  install pinned cargo-mero, write the key from the secret
        │
        ▼  derive-signer-id  ==  the package's published signerId?
        │     no → fail before signing anything
        │
        ▼  cargo mero bundle --key ...   →   cargo mero publish`}</Diagram>
            <CodeBlock>{`name: Deploy Bundle

on:
  push:
    branches: [master]
    paths: ["logic/Cargo.toml"]     # the version lives here and nowhere else
  workflow_dispatch:

# One registry for every step, and the same variable cargo mero reads.
env:
  CALIMERO_REGISTRY_URL: https://apps.calimero.network

# The registry rejects a duplicate version, so never let two publishes
# interleave. Never cancel in progress: a half-finished publish is worse
# than a queued one.
concurrency:
  group: deploy-bundle
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    outputs:
      publish: \${{ steps.decide.outputs.publish }}
      package: \${{ steps.read.outputs.package }}
      version: \${{ steps.read.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Read the package id and version
        id: read
        working-directory: logic
        run: |
          meta=$(cargo metadata --no-deps --format-version 1)
          # The calimero table sits on the workspace for a multi-service
          # bundle and on the package otherwise.
          package=$(jq -er 'first((.metadata.calimero.package,
            .packages[].metadata.calimero.package) | select(. != null))
            // error("no calimero package id")' <<<"$meta")
          # Only the crates the bundle ships: a workspace may also hold an
          # xtask on its own version, which must not block a release.
          version=$(jq -er '(.metadata.calimero.services // [] | map(.crate)) as $svc
            | (if ($svc | length) > 0
               then [.packages[] | select(.name as $n | $svc | index($n)) | .version]
               elif ([.packages[] | select(.metadata.calimero != null)] | length) > 0
                 then [.packages[] | select(.metadata.calimero != null) | .version]
               elif (.packages | length) == 1 then [.packages[0].version]
               else error("declare services[] so this job knows which crates ship") end)
            | unique | if length == 1 then .[0]
              else error("bundle crates disagree on version") end' <<<"$meta")

          # Validate before either reaches a URL: an empty package would query
          # .../bundles//, and a 404 there reads as "not published".
          case "$package" in
            '' | *[!a-zA-Z0-9.-]*) echo "::error::bad package"; exit 1 ;;
          esac
          # Full semver: the registry accepts and orders pre-releases, so
          # rejecting 1.0.0-rc.1 would fail a release it would have taken.
          [[ "$version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$ ]] || {
            echo "::error::version must be semver"; exit 1; }

          echo "package=$package" >> "$GITHUB_OUTPUT"
          echo "version=$version" >> "$GITHUB_OUTPUT"

      - id: decide
        env:
          PACKAGE: \${{ steps.read.outputs.package }}
          VERSION: \${{ steps.read.outputs.version }}
        run: |
          # An unreachable registry must not read as "not published": that
          # would republish blind. Only a definite 404 means new.
          code=$(curl -s -o /dev/null -w '%{http_code}' --retry 3 --max-time 30 \\
            "$CALIMERO_REGISTRY_URL/api/v2/bundles/$PACKAGE/$VERSION" || echo "000")
          case "$code" in
            200) echo "publish=false" >> "$GITHUB_OUTPUT"; exit 0 ;;
            404) : ;;
            *)   echo "::error::registry returned $code"; exit 1 ;;
          esac

          # 404 says unpublished, not newer. A revert produces a version below
          # the latest, and publishing cannot be undone. Without all_versions
          # the listing has one entry, the latest, so .[0] is not an ordering
          # assumption.
          latest=$(curl -fsS --max-time 30 \\
            "$CALIMERO_REGISTRY_URL/api/v2/bundles?package=$PACKAGE" \\
            | jq -er '.[0].appVersion // ""') || {
              echo "::error::could not read the published versions"; exit 1; }

          # sort -V places 1.0.0-rc.1 after 1.0.0, the opposite of semver, so
          # the comparison sits out when either side has a suffix.
          # Build metadata carries no precedence and may contain a hyphen, so
          # strip it before asking whether either side is a pre-release.
          case "\${VERSION%%+*}\${latest%%+*}" in
            *-*) echo "::notice::pre-release, not comparing order" ;;
            *) if [ -n "$latest" ] \\
                 && [ "$(printf '%s\\n%s\\n' "$VERSION" "$latest" | sort -V | tail -1)" != "$VERSION" ]; then
                 echo "::error::$VERSION is not newer than the published $latest"; exit 1
               fi ;;
          esac

          echo "publish=true" >> "$GITHUB_OUTPUT"

  deploy:
    needs: check
    if: needs.check.outputs.publish == 'true'
    runs-on: ubuntu-latest
    # Through the environment, never inlined: a template expression is
    # substituted before the shell sees it, so a crafted value would run.
    env:
      PACKAGE: \${{ needs.check.outputs.package }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-unknown-unknown }
      - uses: ./.github/actions/setup-cargo-mero

      - name: Write signing key
        env:
          MERO_SIGN_KEY: \${{ secrets.MERO_SIGN_KEY }}
        run: |
          umask 077
          printf '%s' "$MERO_SIGN_KEY" > "$RUNNER_TEMP/key.json"

      - name: Verify the signer still matches the published package
        run: |
          signer=$(cargo mero key derive-signer-id --key "$RUNNER_TEMP/key.json")

          # Separate "could not ask" from "nothing published": reading the
          # failure as an empty listing skips this very check.
          if ! listing=$(curl -fsS --retry 3 --max-time 30 \\
              "$CALIMERO_REGISTRY_URL/api/v2/bundles?package=$PACKAGE"); then
            echo "::error::could not reach the registry to verify the signer"
            exit 1
          fi

          # Any entry answers this: the registry pins one signer per package.
          published=$(jq -er '.[0].signerId // ""' <<<"$listing")
          if [ -n "$published" ] && [ "$signer" != "$published" ]; then
            echo "::error::key does not match the published signer; this would"
            echo "::error::land as a NEW application id instead of an upgrade"
            exit 1
          fi

      - name: Build & sign
        id: build
        working-directory: logic
        # --print-output-path rather than rebuilding the versioned filename
        # here, so it has one author and cannot drift out of step.
        run: |
          mpk=$(cargo mero bundle --key "$RUNNER_TEMP/key.json" --print-output-path | tail -1)
          echo "mpk=$mpk" >> "$GITHUB_OUTPUT"

      - name: Remove signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/key.json"

      - run: cargo mero publish "\${{ steps.build.outputs.mpk }}"
        working-directory: logic
        env:
          CALIMERO_API_KEY: \${{ secrets.CALIMERO_REGISTRY_API_KEY }}`}</CodeBlock>

            <SubHeading>The gate answers one question</SubHeading>
            <P>
              The probe asks whether <strong>this exact version</strong> exists,
              which is what makes the job idempotent across re-runs. It does not
              ask whether the version is newer than what is already out, and
              neither does the endpoint <Code>cargo mero publish</Code> uses.
              Only the browser upload enforces that.
            </P>
            <P>
              So a version that slots <em>below</em> the latest still publishes.
              Reverting <Code>1.2.0</Code> to <Code>1.1.0</Code>, or resolving a
              merge conflict the wrong way, produces a version the registry has
              never seen: the probe returns 404 and the release goes out. It
              sorts below the existing latest rather than replacing it, so
              nothing breaks, but published versions are immutable and there is
              no way to take it back.
            </P>
            <Note>
              To close that, either use{' '}
              <Code>cargo mero bundle --bump patch</Code>, which takes the next
              version from the registry so an out-of-order one cannot be
              constructed, or compare against the highest published version in
              the <Code>check</Code> job - the listing is already sorted
              newest-first by semver, so <Code>.[0].appVersion</Code> is the
              value to beat. Not with <Code>sort -V</Code>, though: it orders{' '}
              <Code>1.0.0-rc.1</Code> after <Code>1.0.0</Code>, the opposite of
              semver.
            </Note>

            <SubHeading>Why the registry decides, not git</SubHeading>
            <P>
              Asking the registry whether a version exists holds up under
              re-runs, reverts, and squashed merges. Diffing{' '}
              <Code>Cargo.toml</Code> against the previous commit does not: a
              re-run of the same job sees no diff and skips a release that never
              happened, and a squashed merge can show a version change that was
              already published.
            </P>

            <SubHeading>Pin the toolchain</SubHeading>
            <P>
              Install a released <Code>cargo-mero</Code> binary at a fixed
              version with a checksum, rather than building from git. The tool
              writes what goes inside the bundle, so letting it float means a
              release can change shape without anything in your repository
              changing.
            </P>
            <CodeBlock>{`RELEASE=0.11.0-rc.20

# Per-asset SHA-256, so a re-uploaded asset under the same tag cannot swap
# the binary silently. Refresh these together with RELEASE.
CHECKSUM_x86_64_unknown_linux_gnu=86e32bd1a7fd976dafaa8269dfdfe4e8d89b35f0a62f3a6f6d3c4a6387ec9331
CHECKSUM_aarch64_apple_darwin=9c28ec40692669cbf2249c07afa824ab3296c720fb26670c90de2ca515261d86

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) TARGET=x86_64-unknown-linux-gnu ;;
  Darwin/arm64) TARGET=aarch64-apple-darwin ;;
  *) echo "no released cargo-mero for $(uname -s)/$(uname -m)" >&2; exit 1 ;;
esac
eval "EXPECTED=\\$CHECKSUM_\${TARGET//-/_}"

url="https://github.com/calimero-network/core/releases/download/$RELEASE/cargo-mero_$TARGET.tar.gz"
curl -fsSL "$url" -o cargo-mero.tar.gz

# Verified before unpacking: a tarball that fails the check should never reach
# PATH, let alone run. Without this the checksum above is decoration.
echo "$EXPECTED  cargo-mero.tar.gz" | shasum -a 256 -c - \\
  || { echo "checksum mismatch for $url" >&2; exit 1; }

tar -xzf cargo-mero.tar.gz -C "\${CARGO_HOME:-$HOME/.cargo}/bin"`}</CodeBlock>
            <Note>
              <Shield className='inline w-3.5 h-3.5 text-brand-600 mr-1 -mt-0.5' />
              Write the key to <Code>$RUNNER_TEMP</Code> under{' '}
              <Code>umask 077</Code>, never into the workspace, and delete it in
              an <Code>if: always()</Code> step so a failed build does not leave
              it on the runner.
            </Note>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            ORGANIZATIONS
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='organizations'>Organizations</SectionHeading>
          <div className='space-y-4'>
            <P>
              Organizations let teams collectively own packages. Any member can
              publish new versions and edit metadata for a linked package
              without being the original author. Members are identified by{' '}
              <strong className='text-neutral-200'>email address</strong>, so
              there is no shared key to distribute or rotate.
            </P>

            <SubHeading>How it works</SubHeading>
            <Diagram>{`  ┌─────────────────────────────────────────────────────────────────┐
  │  ORGANIZATION  "my-org"                                         │
  │                                                                  │
  │  Members (by email)           Linked Packages                   │
  │  ────────────────────────────  ────────────────────────────────  │
  │  admin@example.com  (admin)    com.my-org.app-1                  │
  │  alice@example.com  (member)   com.my-org.app-2                  │
  │  bot-my-org@...     (bot)                                        │
  └─────────────────────────────────────────────────────────────────┘

  alice@example.com uploads a new version of com.my-org.app-1:
    Bundle carries a valid Ed25519 signature (Alice's own key)
    Auth: Google session resolves → alice@example.com
    Registry: is alice@example.com in "my-org"?   YES  → 201 Created

  After an admin removes alice:
    Registry: is alice@example.com in "my-org"?   NO   → 403 Forbidden`}</Diagram>
            <Note>
              <Building2 className='inline w-3.5 h-3.5 text-brand-600 mr-1 -mt-0.5' />
              Org membership is accepted by the{' '}
              <strong>browser upload and metadata edits</strong>.{' '}
              <Code>cargo mero publish</Code> goes through the signature-only
              path, so a CI release still has to use the key that published the
              package. That is what the bot account and the org-level{' '}
              <Code>MERO_SIGN_KEY</Code> are for.
            </Note>

            <SubHeading>Setting one up</SubHeading>
            <Steps
              items={[
                [
                  'Create the org',
                  <>
                    Open{' '}
                    <strong className='text-neutral-200'>Organizations</strong>{' '}
                    from the header dropdown, fill in a display name and slug,
                    and click "Create organization". You become the first admin.
                  </>,
                ],
                [
                  'Add members by email',
                  'On the org detail page, enter an email address and a role. Members need a Google account to sign in.',
                ],
                [
                  'Link packages',
                  <>
                    In "Linked packages", enter the package id. You must be the
                    original author or an org admin.
                  </>,
                ],
                [
                  'Generate a token',
                  'Expand "CLI Access" for an API token scoped to your account. Use it for org administration and for CI publishing.',
                ],
              ]}
            />

            <SubHeading>Roles</SubHeading>
            <FieldList
              width='sm:w-16'
              rows={[
                [
                  'Admin',
                  'Add and remove members, change roles, link and unlink packages, update org settings, delete the org.',
                ],
                [
                  'Member',
                  'Publish new versions and edit metadata for org-linked packages. Cannot manage the org itself.',
                ],
                [
                  'Bot',
                  'A non-human account for CI. Can publish and bump versions for the org and nothing else: it cannot sign in, administer the org, or hold admin rights. Packages it publishes are linked to its org automatically.',
                ],
              ]}
            />

            <SubHeading>Revoking access</SubHeading>
            <P>
              Removing a member deletes their email from the member set
              immediately, and the next push authenticated with that email is
              rejected with <Code>403</Code>. No key rotation is involved,
              because the registry never trusted the key for org access in the
              first place.
            </P>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            REGISTRY CLI
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='registry-cli'>Registry CLI</SectionHeading>
          <div className='space-y-4'>
            <P>
              <Code>calimero-registry</Code> covers what talks to the registry
              rather than to your app: organization administration and metadata
              edits. Building and publishing bundles is <Code>cargo mero</Code>
              &apos;s job.
            </P>

            <SubHeading>Installation and configuration</SubHeading>
            <CodeBlock>{`npm install -g @calimero-network/registry-cli

# save the defaults once
calimero-registry config set registry-url https://apps.calimero.network
calimero-registry config set api-key <token>

# or per-session, the same variables cargo mero reads
export CALIMERO_REGISTRY_URL=https://apps.calimero.network
export CALIMERO_API_KEY=<token>`}</CodeBlock>

            <SubHeading>Organization commands</SubHeading>
            <CodeBlock>{`# organizations (list resolves your email from the token)
calimero-registry org list
calimero-registry org create -n "My Org" -s "my-org"
calimero-registry org get    <org-id>                    # public
calimero-registry org update <org-id> --name "New Name"
calimero-registry org delete <org-id>

# members, by email
calimero-registry org members list   <org-id>            # public
calimero-registry org members add    <org-id> alice@example.com --role member
calimero-registry org members update <org-id> alice@example.com --role admin
calimero-registry org members remove <org-id> alice@example.com

# package linking
calimero-registry org packages link   <org-id> com.my-org.app-1
calimero-registry org packages unlink <org-id> com.my-org.app-1`}</CodeBlock>

            <SubHeading>Bundle commands</SubHeading>
            <CodeBlock>{`# edit published metadata (name, description, links) — see Publishing
calimero-registry bundle edit <package> <version> --remote [--manifest signed.json]

# inspect a bundle you have locally
calimero-registry bundle get <package> <version> --local`}</CodeBlock>
            <Note>
              <Key className='inline w-3.5 h-3.5 text-brand-600 mr-1 -mt-0.5' />
              <Code>bundle create</Code> and <Code>bundle push</Code> still
              exist for bundles built outside the Rust toolchain, but they
              predate <Code>cargo mero</Code> and do not know about services,
              icons, or embedded ABIs. Use <Code>cargo mero bundle</Code> and{' '}
              <Code>cargo mero publish</Code> for anything built from a Calimero
              app crate.
            </Note>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            INSTALLATION & VALIDATION
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='installation-validation'>
            Install & Validation
          </SectionHeading>
          <div className='space-y-4'>
            <P>
              A node installs an app by downloading the <Code>.mpk</Code> and
              verifying it in full before running any WebAssembly. The same
              check runs whether the bundle came from this registry or a local
              file.
            </P>
            <CodeBlock>{`meroctl app install --path dist/com.example.my-app-1.2.4.mpk`}</CodeBlock>

            <SubHeading>Verification process</SubHeading>
            <Diagram>{`  Download .mpk from the registry
        │
  ┌──────────────────────────────────┐
  │  bundle.mpk  (tar.gz)            │
  │  ├── manifest.json               │
  │  ├── app.wasm                    │
  │  └── abi.json                    │
  └──────────────────────────────────┘
        │
        ▼  Extract manifest.json
        │
        ▼  Remove signature field + all _* prefixed fields
        │
        ▼  RFC 8785 (JCS) canonicalize
        │  → deterministic JSON string regardless of field order
        │
        ▼  SHA-256 hash of canonical bytes
        │
        ▼  Ed25519 verify(sig, hash, pubkey)
        │
        ├── ✓ VALID   → SHA-256 each wasm against its manifest hash
        │              → derive ApplicationId from package + signerId
        │              → mount WASM, start app
        │
        └── ✗ INVALID → reject, show the error`}</Diagram>

            <SubHeading>What is checked</SubHeading>
            <FieldList
              width='sm:w-36'
              rows={[
                ['Algorithm', 'Must be ed25519. Nothing else is accepted.'],
                [
                  'Key length',
                  'The public key must decode to exactly 32 bytes and the signature to 64.',
                ],
                [
                  'Canonical JSON',
                  'RFC 8785 canonicalization is re-run on the verifier side to reproduce the exact bytes the signer hashed, so field order and whitespace cannot affect the result.',
                ],
                [
                  'SHA-256 pre-hash',
                  'The signing payload is SHA-256(canonical_bytes), not the raw bytes.',
                ],
                [
                  'Artifact integrity',
                  'Each wasm and abi hash in the manifest is covered by the signature and re-checked against the extracted file, so a binary swapped after signing is caught.',
                ],
                [
                  'Version pinning',
                  'A node requests a specific package and version. Nodes do not auto-upgrade.',
                ],
              ]}
            />

            <SubHeading>Trust model</SubHeading>
            <P>
              The registry is a{' '}
              <strong className='text-neutral-200'>cryptographic anchor</strong>
              , not a code reviewer. It proves a bundle matches its signature
              and that the signature belongs to the key that owns the package.
              It does not vouch for what the code does. Audit apps before
              installing them: if you trust the signer, you trust the bundle.
            </P>

            <div className='card p-4 mt-2'>
              <p className='text-[12px] text-neutral-500 font-light'>
                For more on the Calimero node runtime, the ABI and state
                migrations, and how the Desktop client manages installed apps,
                see the{' '}
                <a
                  href='https://docs.calimero.network'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-brand-600 hover:text-brand-500 inline-flex items-center gap-1'
                >
                  official documentation
                  <ExternalLink className='w-3 h-3' />
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
