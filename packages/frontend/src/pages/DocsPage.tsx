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
  { id: 'calimero-apps', label: 'Calimero Apps' },
  { id: 'mero-sign', label: 'mero-sign' },
  { id: 'cli', label: 'Registry CLI' },
  { id: 'creating-a-bundle', label: 'Creating a Bundle' },
  { id: 'frontend-workflow', label: 'Frontend Workflow' },
  { id: 'new-versions', label: 'New Versions' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'installation-validation', label: 'Installation & Validation' },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className='text-[11px] text-brand-600 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5 font-mono'>
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className='text-[11.5px] text-neutral-300 bg-neutral-950 border border-neutral-800 rounded-lg p-4 overflow-x-auto font-mono leading-relaxed'>
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
    <div className='rounded-lg border border-brand-900/40 bg-brand-950/20 px-4 py-3 text-[12px] text-neutral-300 font-light leading-relaxed'>
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
      <aside className='hidden lg:block w-48 flex-shrink-0'>
        <nav className='sticky top-20'>
          <p className='section-heading mb-3'>On this page</p>
          <ul className='space-y-0.5'>
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={`block px-3 py-1.5 rounded-md text-[12px] transition-colors ${
                    activeSection === id
                      ? 'bg-neutral-800/80 text-brand-600 font-medium'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40'
                  }`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className='mt-5 pt-4 border-t border-neutral-800/60'>
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
      <div className='flex-1 min-w-0 space-y-16 pb-16'>
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
              </strong>{' '}
              — the registry records who published it, and any consumer can
              verify its authenticity independently.
            </P>
            <Diagram>{`
  Developer                        Registry                        Node
      │                               │                              │
      │  1. Build .wasm               │                              │
      │  2. Sign manifest (mero-sign) │                              │
      │  3. Pack → .mpk bundle        │                              │
      │──── bundle push ─────────────▶│                              │
      │                               │  verify Ed25519 signature    │
      │                               │  store manifest + binary     │
      │                               │                              │
      │                               │◀──── browse / search ────────│
      │                               │───── download .mpk ─────────▶│
      │                               │                              │  verify signature
      │                               │                              │  mount WASM ✓
`}</Diagram>
            <P>The registry is made up of four parts:</P>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2'>
              {[
                {
                  icon: Package,
                  title: 'Backend API',
                  desc: 'Fastify server backed by Redis. Validates every Ed25519 signature on upload and stores manifests + binaries.',
                },
                {
                  icon: BookOpen,
                  title: 'Frontend',
                  desc: 'The web UI you are using now — browse apps, upload bundles, manage organizations.',
                },
                {
                  icon: Terminal,
                  title: 'calimero-registry CLI',
                  desc: 'Create bundles, push to registry, edit metadata, manage organizations from the terminal.',
                },
                {
                  icon: Key,
                  title: 'mero-sign',
                  desc: 'Standalone Ed25519 signing tool. Generates key files and signs manifests before publishing.',
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
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CALIMERO APPS
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='calimero-apps'>Calimero Apps</SectionHeading>
          <div className='space-y-4'>
            <P>
              A Calimero app is a{' '}
              <strong className='text-neutral-200'>
                WebAssembly module packaged with a signed manifest
              </strong>{' '}
              into an <Code>.mpk</Code> file. The node runtime loads the WASM,
              calls its exported functions, and manages its on-chain state.
            </P>

            <SubHeading>Bundle format (.mpk)</SubHeading>
            <P>
              An <Code>.mpk</Code> file is a gzip-compressed tar archive:
            </P>
            <CodeBlock>{`bundle.mpk  (tar.gz)
├── manifest.json   ← metadata + Ed25519 signature
├── app.wasm        ← compiled WebAssembly module
└── abi.json        ← optional ABI schema`}</CodeBlock>

            <SubHeading>Manifest structure</SubHeading>
            <P>
              The manifest describes the app and carries the signature that
              proves who published it. Here is a complete example:
            </P>
            <CodeBlock>{`{
  "version":    "1.0",
  "package":    "com.example.myapp",     // reverse-domain, set at creation, immutable
  "appVersion": "1.0.0",                 // semver, immutable per version

  "metadata": {
    "name":        "My App",
    "description": "What this app does",
    "author":      "dev@example.com"     // set from your Google session on push, not editable
  },

  "interfaces": {
    "exports": ["kv-store"],             // capabilities this app provides to others
    "uses":    ["messaging"]             // capabilities it requires from the node
  },

  "wasm": {
    "path": "app.wasm",
    "hash": "sha256:abc123...",          // SHA-256 of the binary, verified on install
    "size": 283441
  },

  "abi": {                               // optional — ABI schema for callers
    "path": "abi.json",
    "hash": "sha256:def456...",
    "size": 4200
  },

  "links": {
    "frontend": "https://my-frontend.example.com",
    "github":   "https://github.com/org/repo",
    "docs":     "https://docs.example.com"
  },

  "signature": {
    "alg":      "ed25519",
    "pubkey":   "yuKE404BaldXazEIUC4XrVGFyXxxyoRVjrrGhcKk1P4",   // base64url public key
    "sig":      "base64url-64-byte-signature...",
    "signedAt": "2024-01-15T12:00:00Z"
  },

  "migrations": []
}`}</CodeBlock>
            <Note>
              <strong>Immutable after publish:</strong> <Code>package</Code>,{' '}
              <Code>appVersion</Code>, <Code>wasm</Code>, and <Code>abi</Code>{' '}
              cannot be changed. <Code>metadata.author</Code> is set by the
              registry from your Google session and cannot be overwritten — even
              via the CLI. Only <Code>metadata.name</Code>,{' '}
              <Code>metadata.description</Code>, and <Code>links</Code> are
              editable after publishing.
            </Note>

            <SubHeading>Package naming</SubHeading>
            <P>
              Package names follow reverse-domain notation:{' '}
              <Code>com.myorg.myapp</Code>. Only lowercase letters, numbers,
              dots, and hyphens are allowed. The first publish of a package name
              claims it — only the original signer (or org members, if linked to
              an org) can push subsequent versions.
            </P>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            MERO-SIGN
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='mero-sign'>mero-sign</SectionHeading>
          <div className='space-y-4'>
            <P>
              <strong className='text-neutral-200'>mero-sign</strong> is a
              standalone CLI tool for Ed25519 key management and manifest
              signing. Every bundle pushed to the registry must carry a valid
              signature. mero-sign produces the <Code>signature</Code> block
              that goes inside <Code>manifest.json</Code>.
            </P>

            <SubHeading>Generating a key</SubHeading>
            <CodeBlock>{`mero-sign generate-key --output key.json`}</CodeBlock>
            <P>
              This writes a JSON key file you use for all signing operations:
            </P>
            <CodeBlock>{`{
  "private_key": "PZbZ5yM9t63qOHMM-CCzExbNv8u79XTxZT9UW8GQJ60",
  "public_key":  "yuKE404BaldXazEIUC4XrVGFyXxxyoRVjrrGhcKk1P4",
  "signer_id":   "did:key:z6Mkt7Ejb12a1BxvRiUpd5YWkMrk8KVjaShW2vMt6trm7FGH"
}`}</CodeBlock>
            <div className='rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2.5'>
              {[
                [
                  'private_key',
                  'Base64url-encoded 32-byte Ed25519 secret. Never share this — anyone with it can sign on your behalf.',
                ],
                [
                  'public_key',
                  'Base64url-encoded 32-byte public key. Share this with org admins when joining an organization.',
                ],
                [
                  'signer_id',
                  'did:key DID representation of the public key — used as a stable identity reference.',
                ],
              ].map(([field, desc]) => (
                <div key={field} className='flex gap-3 text-[12px]'>
                  <span className='text-brand-600 font-mono w-28 flex-shrink-0'>
                    {field}
                  </span>
                  <span className='text-neutral-400 font-light'>{desc}</span>
                </div>
              ))}
            </div>
            <Note>
              <strong>Security:</strong> Store <Code>key.json</Code> outside
              your project directory and add it to <Code>.gitignore</Code>.
              Never commit private keys to version control.
            </Note>

            <SubHeading>How signing works</SubHeading>
            <CodeBlock>{`mero-sign sign manifest.json --key key.json
# → writes signed-manifest.json with the signature block filled in`}</CodeBlock>
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
         ▼  Inject signature block into manifest:
            {
              "alg":      "ed25519",
              "pubkey":   "base64url-32-bytes",
              "sig":      "base64url-64-bytes",
              "signedAt": "ISO-8601"
            }`}</Diagram>
            <P>
              The registry re-runs this exact process on every upload and
              verifies the signature matches. A mismatch returns{' '}
              <Code>400 invalid_signature</Code>.
            </P>

            <SubHeading>mero-sign and org membership</SubHeading>
            <P>
              Org members sign bundles with their own personal mero-sign key —
              not a shared org key. The registry accepts a bundle from an org
              member when the bundle has a valid Ed25519 signature (any key) and
              the pusher's authenticated email is in the org's member list.
            </P>
            <CodeBlock>{`# Each developer keeps their own key
mero-sign generate-key --output my-key.json
echo "my-key.json" >> .gitignore

# Sign as usual — the registry will validate org membership via your email
mero-sign sign manifest.json --key my-key.json`}</CodeBlock>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CLI
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='cli'>calimero-registry CLI</SectionHeading>
          <div className='space-y-4'>
            <P>
              The CLI handles bundle packaging, pushing, editing, and org
              management. It talks directly to the registry API.
            </P>

            <SubHeading>Installation</SubHeading>
            <CodeBlock>{`npm install -g @calimero-network/registry-cli
# or
pnpm add -g @calimero-network/registry-cli`}</CodeBlock>

            <SubHeading>Configuration</SubHeading>
            <CodeBlock>{`# Set registry URL once (saved to config file)
calimero-registry config set registry-url https://apps.calimero.network

# Or use an environment variable per-session
export CALIMERO_REGISTRY_URL=https://apps.calimero.network`}</CodeBlock>

            <SubHeading>bundle create</SubHeading>
            <P>
              Writes <Code>manifest.json</Code>, <Code>app.wasm</Code>, and
              optionally <Code>abi.json</Code> to an output directory.{' '}
              <strong className='text-neutral-200'>
                Does not pack into .mpk
              </strong>{' '}
              — sign the manifest first, then use <Code>bundle push</Code>.
            </P>
            <CodeBlock>{`# Minimal — outputs to com.example.myapp/1.0.0/
calimero-registry bundle create app.wasm com.example.myapp 1.0.0

# With full metadata, output to dist/myapp/
calimero-registry bundle create app.wasm com.example.myapp 1.0.0 \\
  --name        "My App" \\
  --description "Does something useful" \\
  --frontend    https://my-app.example.com \\
  --github      https://github.com/org/repo \\
  --abi         res/abi.json \\
  --output      dist/myapp

# From a bundle-manifest.json config file
calimero-registry bundle create app.wasm --manifest bundle-manifest.json`}</CodeBlock>
            <P>
              The bundle manifest config file lets you store all options in
              JSON:
            </P>
            <CodeBlock>{`{
  "package":     "com.example.myapp",
  "version":     "1.0.0",
  "output":      "./dist/myapp",
  "name":        "My App",
  "description": "Does something useful",
  "frontend":    "https://my-app.example.com",
  "github":      "https://github.com/org/repo",
  "docs":        "https://docs.example.com",
  "exports":     ["kv-store"],
  "uses":        [],
  "abi":         "res/abi.json"
}`}</CodeBlock>

            <SubHeading>bundle push</SubHeading>
            <CodeBlock>{`# Push a directory (created by bundle create) — packs into .mpk on the fly
calimero-registry bundle push dist/myapp --remote

# Push an already-packed .mpk (e.g. built by your own script)
calimero-registry bundle push myapp-1.0.0.mpk --remote

# Push with explicit registry URL (overrides config)
calimero-registry bundle push dist/myapp --remote \\
  --url https://apps.calimero.network`}</CodeBlock>

            <SubHeading>bundle edit</SubHeading>
            <P>
              Edit mutable metadata (name, description, links) for an already
              published version. This is a two-step process — fetch + sign +
              PATCH:
            </P>
            <CodeBlock>{`# Step 1: Fetch current manifest, apply your changes, write to file
calimero-registry bundle edit com.example.myapp 1.0.0 --remote \\
  --name        "New Name" \\
  --description "Updated description" \\
  -o manifest.json

# Step 2: Sign the manifest with your key
mero-sign sign manifest.json --key key.json

# Step 3: PATCH the signed manifest to the registry
calimero-registry bundle edit com.example.myapp 1.0.0 --remote \\
  --manifest signed-manifest.json`}</CodeBlock>

            <SubHeading>org commands</SubHeading>
            <P>
              All org write operations use an API token. Get yours from the
              Organizations page in the web UI (CLI Access section), then
              configure it once:
            </P>
            <CodeBlock>{`# One-time: save your API token
calimero-registry config set api-key <token>
# or use an env variable: export CALIMERO_API_KEY=<token>

# List your organizations (resolves your email from the token automatically)
calimero-registry org list

# Create an organization
calimero-registry org create -n "My Org" -s "my-org"

# Get org details (public — no token needed)
calimero-registry org get <org-id>

# Member management — add/remove by email
calimero-registry org members list   <org-id>
calimero-registry org members add    <org-id> alice@example.com --role member
calimero-registry org members add    <org-id> alice@example.com --role admin
calimero-registry org members update <org-id> alice@example.com --role admin
calimero-registry org members remove <org-id> alice@example.com

# Package linking
calimero-registry org packages link   <org-id> com.example.myapp
calimero-registry org packages unlink <org-id> com.example.myapp`}</CodeBlock>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CREATING A BUNDLE
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='creating-a-bundle'>
            Creating a Bundle
          </SectionHeading>
          <div className='space-y-4'>
            <P>
              There are two paths to publish a bundle. Both end with the same
              thing: a <Code>.mpk</Code> containing a{' '}
              <strong className='text-neutral-200'>signed</strong>{' '}
              <Code>manifest.json</Code> + <Code>app.wasm</Code> + optional{' '}
              <Code>abi.json</Code>.
            </P>

            <Note>
              <strong className='text-neutral-200'>Key rule:</strong> mero-sign
              operates on a standalone <Code>manifest.json</Code> file — not on
              a packed archive. Always sign first, pack second.
            </Note>

            <SubHeading>Path A — using the CLI</SubHeading>
            <P>
              <Code>bundle create</Code> writes the files to a directory.{' '}
              <Code>bundle push &lt;dir&gt;</Code> packs and sends in one step.
            </P>
            <CodeBlock>{`# 1. Build your WASM
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/myapp.wasm ./app.wasm

# 2. One-time: generate your signing key
mero-sign generate-key --output key.json
echo "key.json" >> .gitignore
# → key.json  { private_key, public_key, signer_id }

# 3. Create bundle files (writes to dist/myapp/, does NOT pack yet)
calimero-registry bundle create app.wasm com.example.myapp 1.0.0 \\
  --name "My App" \\
  --description "A useful app" \\
  --abi res/abi.json \\
  --output dist/myapp
# → dist/myapp/manifest.json  (unsigned, SHA256 hash already computed)
# → dist/myapp/app.wasm
# → dist/myapp/abi.json

# 4. Sign the manifest
mero-sign sign dist/myapp/manifest.json --key key.json
# → manifest.json now contains a signature field

# 5. Push — packs into .mpk on the fly and sends to registry
calimero-registry bundle push dist/myapp --remote
# → Registry verifies Ed25519 signature ✓
# → App visible at /apps`}</CodeBlock>

            <SubHeading>Path B — bring your own .mpk</SubHeading>
            <P>
              If you already build the bundle with your own script (or manually
              with tar), just pass the <Code>.mpk</Code> directly. As long as
              the <Code>manifest.json</Code> inside is signed before you tar it,
              the registry will accept it.
            </P>
            <CodeBlock>{`# Your script: copies wasm, creates manifest.json, signs it, tars it
./build-bundle.sh
# → res/myapp-1.0.0.mpk  (manifest.json inside is already signed)

# Push the .mpk directly
calimero-registry bundle push res/myapp-1.0.0.mpk --remote`}</CodeBlock>
            <Note>
              The order matters: sign <Code>manifest.json</Code> first, then{' '}
              <Code>tar -czf</Code>. If you tar first and sign after, the
              signature won't be inside the archive and the push will fail.
            </Note>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            FRONTEND WORKFLOW
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='frontend-workflow'>
            Frontend Workflow
          </SectionHeading>
          <div className='space-y-4'>
            <SubHeading>Uploading a bundle</SubHeading>
            <P>
              You can publish bundles directly from the browser without the CLI:
            </P>
            <Steps
              items={[
                [
                  'Sign in',
                  'Click "Sign in" in the header and authenticate with Google. Your email becomes the package author field — it is set server-side and cannot be changed later.',
                ],
                [
                  'Go to Upload',
                  <>
                    Navigate to{' '}
                    <strong className='text-neutral-200'>Upload</strong> in the
                    top nav. Drag-and-drop or select your signed{' '}
                    <Code>.mpk</Code> file.
                  </>,
                ],
                [
                  'Publish',
                  'Click Publish. The registry validates the Ed25519 signature and stores the bundle. Your app appears in /apps immediately.',
                ],
              ]}
            />

            <SubHeading>Editing metadata via the frontend</SubHeading>
            <P>
              Package owners and org members can update display metadata (name,
              description, links) through the registry UI without the CLI — but
              the final PATCH still requires a CLI step because it must be
              signed:
            </P>
            <Steps
              items={[
                [
                  'Open your app',
                  'Find your app in /apps. You must be signed in as the author, or have your org pubkey set in the Organizations page as a member of the linked org.',
                ],
                [
                  'Click Edit metadata',
                  'The pencil icon appears next to the version pill. Clicking it opens the edit form.',
                ],
                [
                  'Make changes',
                  'Edit name, description, or links in the form.',
                ],
                [
                  'Download manifest',
                  <>
                    Click "Download manifest.json". The file has your changes
                    applied but{' '}
                    <strong className='text-neutral-200'>no signature</strong> —
                    you must sign it before the registry will accept it.
                  </>,
                ],
                [
                  'Sign',
                  <>
                    <CodeBlock>{`# Sign with your own mero-sign key (original author or org member)
mero-sign sign manifest.json --key key.json`}</CodeBlock>
                  </>,
                ],
                [
                  'Publish',
                  <CodeBlock>{`calimero-registry bundle edit <pkg> <version> --remote --manifest signed-manifest.json`}</CodeBlock>,
                ],
              ]}
            />
            <Note>
              The <Code>author</Code> field is always preserved from the
              original publish. It cannot be cleared or changed via edit — even
              through the CLI.
            </Note>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            NEW VERSIONS
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='new-versions'>New Versions</SectionHeading>
          <div className='space-y-4'>
            <P>
              Every version of a package is stored separately. Pushing a new
              version does not replace the old one — both remain accessible and
              installable.
            </P>

            <Diagram>{`  com.example.myapp
       │
       ├── 1.0.0   published 2024-01-01   ← still accessible
       ├── 1.1.0   published 2024-02-15
       ├── 1.1.1   published 2024-02-20   ← shown as "latest" in the UI
       └── 2.0.0-beta.1  published 2024-03-01`}</Diagram>

            <SubHeading>Rules</SubHeading>
            <div className='space-y-2'>
              {[
                [
                  'Semver format',
                  'Versions must follow MAJOR.MINOR.PATCH. Pre-release suffixes are allowed: 1.0.0-beta.1, 1.0.0-rc.2.',
                ],
                [
                  'No overwrites',
                  'Once a version is published it cannot be replaced. If you need to fix a bug in 1.0.0, publish 1.0.1.',
                ],
                [
                  'Same signer',
                  'The same key that published 1.0.0 (or a key in manifest.owners, or an org member) must sign 1.1.0.',
                ],
              ].map(([rule, desc]) => (
                <div key={rule} className='flex gap-3 text-[12px]'>
                  <span className='text-brand-600 font-mono w-28 flex-shrink-0'>
                    {rule}
                  </span>
                  <span className='text-neutral-400 font-light'>{desc}</span>
                </div>
              ))}
            </div>

            <SubHeading>Publishing a new version</SubHeading>
            <CodeBlock>{`# Build new version
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/myapp.wasm ./app.wasm

# Create bundle files for new version
calimero-registry bundle create app.wasm com.example.myapp 1.1.0 \\
  --output dist/myapp-1.1.0

# Sign the manifest
mero-sign sign dist/myapp-1.1.0/manifest.json --key key.json

# Push (same key as before — registry checks it matches the original signer)
calimero-registry bundle push dist/myapp-1.1.0 --remote`}</CodeBlock>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            ORGANIZATIONS
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='organizations'>Organizations</SectionHeading>
          <div className='space-y-4'>
            <P>
              Organizations let teams collectively own and manage packages. Any
              org member can push new versions and edit metadata for packages
              linked to the org — without being the original Google-account
              author. Members are identified by their{' '}
              <strong className='text-neutral-200'>email address</strong>. Org
              management in the browser uses your Google session; the CLI uses
              an API token.
            </P>

            <SubHeading>How it works</SubHeading>
            <Diagram>{`  ┌─────────────────────────────────────────────────────────────────┐
  │  ORGANIZATION  "my-org"                                         │
  │                                                                  │
  │  Members (by email)           Linked Packages                   │
  │  ────────────────────────────  ────────────────────────────────  │
  │  admin@example.com  (admin)    com.my-org.app-1                  │
  │  alice@example.com  (member)   com.my-org.app-2                  │
  │  bob@example.com    (member)                                     │
  └─────────────────────────────────────────────────────────────────┘

  alice@example.com pushes a new version of com.my-org.app-1:
    Bundle must have a valid Ed25519 signature (any key — mero-sign)
    Auth: Google session or Bearer API token resolves → alice@example.com
    Registry: is alice@example.com in org "my-org" members?  YES  → 200 OK

  After admin removes alice:
    Registry: is alice@example.com in org "my-org" members?  NO   → 403 Forbidden`}</Diagram>

            <SubHeading>Setting up an organization — step by step</SubHeading>
            <Steps
              items={[
                [
                  'Sign in',
                  'Click "Sign in" in the header and authenticate with Google. Your email is your org identity.',
                ],
                [
                  'Create the org',
                  <>
                    Open{' '}
                    <strong className='text-neutral-200'>Organizations</strong>{' '}
                    from the header dropdown. Fill in the display name and slug,
                    click "Create organization". You automatically become the
                    first admin.
                  </>,
                ],
                [
                  'Get a CLI API token',
                  <>
                    On the Organizations page, expand the{' '}
                    <strong className='text-neutral-200'>CLI Access</strong>{' '}
                    section. Click "Generate token", copy the token (shown only
                    once), then run:
                    <CodeBlock>{`calimero-registry config set api-key <token>`}</CodeBlock>
                  </>,
                ],
                [
                  'Add members by email',
                  <>
                    In the org detail page, enter a member's email address and
                    their role (admin or member). Members must have a Google
                    account to log in and push bundles. You can also add from
                    the CLI:
                    <CodeBlock>{`calimero-registry org members add <org-id> alice@example.com --role member`}</CodeBlock>
                  </>,
                ],
                [
                  'Link packages',
                  <>
                    In the org detail page "Linked packages" section, enter the
                    package name. You must be the original author of the package
                    (or already an org admin). CLI equivalent:
                    <CodeBlock>{`calimero-registry org packages link <org-id> com.my-org.app-1`}</CodeBlock>
                  </>,
                ],
              ]}
            />

            <SubHeading>Publishing as an org member</SubHeading>
            <P>
              Org members still need to sign bundles with mero-sign — the
              difference is they authenticate to the registry via their own
              Google session or API token, and the registry checks their email
              against the org member list.
            </P>
            <CodeBlock>{`# alice@example.com publishing a new version of com.my-org.app-1:

# 1. Build WASM
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/app.wasm ./app.wasm

# 2. Create bundle files
calimero-registry bundle create app.wasm com.my-org.app-1 2.0.0 \\
  --output dist/app-2.0.0

# 3. Sign the manifest with Alice's own key
mero-sign sign dist/app-2.0.0/manifest.json --key alice-key.json

# 4. Push (CLI uses CALIMERO_API_KEY / config api-key for auth)
calimero-registry bundle push dist/app-2.0.0 --remote
# → Registry verifies Ed25519 signature ✓
# → Registry resolves alice@example.com from token ✓
# → Registry confirms alice is a member of "my-org" ✓
# → Bundle stored successfully`}</CodeBlock>

            <SubHeading>Member roles</SubHeading>
            <div className='rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2.5'>
              {[
                [
                  'Admin',
                  'Can add/remove members by email, change roles, link/unlink packages, update org settings, delete org.',
                ],
                [
                  'Member',
                  'Can push new versions and edit metadata for org-linked packages. Cannot manage the org itself.',
                ],
              ].map(([role, desc]) => (
                <div key={role} className='flex gap-3 text-[12px]'>
                  <span className='text-brand-600 font-mono w-16 flex-shrink-0'>
                    {role}
                  </span>
                  <span className='text-neutral-400 font-light'>{desc}</span>
                </div>
              ))}
            </div>

            <SubHeading>Revoking access</SubHeading>
            <P>
              When an admin removes a member, their email is deleted from the
              member set immediately. Any further push attempt authenticated
              with that email is rejected with <Code>403</Code>. No key rotation
              needed — the registry simply no longer recognizes that email as
              authorized for the org.
            </P>

            <SubHeading>CLI org management reference</SubHeading>
            <CodeBlock>{`# Requires CALIMERO_API_KEY set or configured
calimero-registry config set api-key <token>

calimero-registry org list
calimero-registry org create -n "My Org" -s "my-org"
calimero-registry org get <org-id>
calimero-registry org update <org-id> --name "New Name"
calimero-registry org delete <org-id>

calimero-registry org members list   <org-id>
calimero-registry org members add    <org-id> alice@example.com --role member
calimero-registry org members update <org-id> alice@example.com --role admin
calimero-registry org members remove <org-id> alice@example.com

calimero-registry org packages link   <org-id> com.my-org.app-1
calimero-registry org packages unlink <org-id> com.my-org.app-1`}</CodeBlock>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            INSTALLATION & VALIDATION
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='installation-validation'>
            Installation & Validation
          </SectionHeading>
          <div className='space-y-4'>
            <P>
              When a Calimero node installs an app through the Calimero Desktop
              client, it downloads the <Code>.mpk</Code> from the registry and
              performs full cryptographic verification before running any WASM.
            </P>

            <SubHeading>Verification process</SubHeading>
            <Diagram>{`  Calimero Desktop
        │
        ▼  Download .mpk from registry
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
        ├── ✓ VALID   → SHA-256 check app.wasm against manifest.wasm.hash
        │              → Mount WASM, start app
        │
        └── ✗ INVALID → Reject, show error to user`}</Diagram>

            <SubHeading>What is checked</SubHeading>
            <div className='space-y-2'>
              {[
                [
                  'Algorithm',
                  'Must be ed25519. Other algorithms are not accepted.',
                ],
                [
                  'Key length',
                  'Public key must decode to exactly 32 bytes. Signature must be 64 bytes.',
                ],
                [
                  'Canonical JSON',
                  'RFC 8785 canonicalization is re-run on the verifier side to produce the exact same bytes the signer hashed. Field order and whitespace cannot affect the result.',
                ],
                [
                  'SHA-256 pre-hash',
                  'The signing payload is SHA-256(canonical_bytes) — not the raw bytes. This matches what mero-sign produces.',
                ],
                [
                  'WASM integrity',
                  'manifest.wasm.hash (set at bundle creation time and included in the signature) is compared to SHA-256 of the extracted app.wasm to detect tampering of the binary after signing.',
                ],
                [
                  'Version pinning',
                  'The node requests a specific package@version. The registry serves the binary for that exact version. Nodes do not auto-upgrade.',
                ],
              ].map(([field, desc]) => (
                <div key={field} className='flex gap-3 text-[12px]'>
                  <span className='text-brand-600 font-mono w-36 flex-shrink-0'>
                    {field}
                  </span>
                  <span className='text-neutral-400 font-light'>{desc}</span>
                </div>
              ))}
            </div>

            <SubHeading>Trust model</SubHeading>
            <P>
              The registry is a{' '}
              <strong className='text-neutral-200'>cryptographic anchor</strong>
              , not a code reviewer. It verifies that the bundle matches the
              signature, but it does not vouch for what the code actually does.
              Node operators should audit apps before installing. The public key
              in the signature establishes authorship — if you trust the key,
              you trust the bundle.
            </P>

            <div className='card p-4 mt-2'>
              <p className='text-[12px] text-neutral-500 font-light'>
                For more on the Calimero node runtime, inter-app communication
                via interfaces, and how the Desktop client manages installed
                apps, see the{' '}
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

// Suppress unused import warnings for icons used in JSX
void [GitBranch, Upload, Shield, Building2];
