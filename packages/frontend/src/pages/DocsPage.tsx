import { useState, useEffect, useRef } from 'react';
import { usePageMeta } from '@/lib/seo';
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
  ChevronDown,
} from 'lucide-react';

const SECTIONS = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'bundles', label: 'Bundles & Manifests' },
  { id: 'meroctl', label: 'meroctl' },
  { id: 'signing', label: 'Signing & Identity' },
  { id: 'metadata', label: 'Required Metadata' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'ci', label: 'Publishing from CI' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'registry-cli', label: 'Registry CLI' },
  { id: 'installation-validation', label: 'Install & Validation' },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className='rounded border border-brand-600/20 bg-brand-600/[0.08] px-1.5 py-0.5 font-mono text-[12.5px] text-brand-600'>
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className='overflow-x-auto rounded-lg border border-line bg-[var(--surface-2)] p-4 font-mono text-[13px] leading-relaxed text-neutral-300'>
      {children}
    </pre>
  );
}

function Diagram({ children }: { children: string }) {
  return (
    <pre className='overflow-x-auto rounded-lg border border-brand-600/25 bg-[var(--surface-2)] p-5 font-mono text-[12px] leading-loose text-brand-600'>
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
    <div className='mb-5 scroll-mt-24' id={id}>
      {/* A rule in the accent above each heading. Ten sections ran together
          as one column of grey text with nothing between them; a chapter mark
          is cheaper than a full divider and does not cut the page into
          boxes. */}
      <span
        aria-hidden='true'
        className='mb-4 block h-[3px] w-10 bg-brand-600'
      />
      <h2 className='text-[28px] font-black uppercase leading-tight tracking-[0.01em] text-neutral-100 sm:text-[34px]'>
        {children}
      </h2>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className='mb-3 mt-10 flex items-center gap-2.5 text-[15px] font-bold uppercase tracking-[0.14em] text-neutral-100'>
      <span
        aria-hidden='true'
        className='h-3.5 w-[2px] flex-shrink-0 bg-brand-600'
      />
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-[16px] text-neutral-400 font-light leading-relaxed'>
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className='rounded-lg border-l-[3px] border-brand-600/70 bg-brand-600/[0.07] px-4 py-3 text-[14px] font-light leading-relaxed text-neutral-300'>
      {children}
    </div>
  );
}

function Steps({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <ol className='space-y-3 list-none'>
      {items.map(([step, desc], i) => (
        <li key={i} className='flex gap-3'>
          <span className='flex-shrink-0 w-6 h-6 border border-brand-600 text-brand-600 text-[12px] font-bold flex items-center justify-center mt-0.5'>
            {i + 1}
          </span>
          <div className='text-[15px] text-neutral-400 font-light leading-relaxed'>
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
    <div className='rounded-lg border border-line bg-ink/[0.02] p-4 space-y-3'>
      {rows.map(([field, desc]) => (
        <div
          key={field}
          className='flex flex-col sm:flex-row gap-0.5 sm:gap-3 text-[14px]'
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
  usePageMeta({
    title: 'Documentation',
    description:
      'Build, sign and publish a Calimero application bundle with meroctl — from an empty directory to a package installable from this registry.',
  });

  const [activeSection, setActiveSection] = useState('introduction');
  // The mobile table of contents. Closed by default: it is a jump list, not
  // part of the page.
  const [tocOpen, setTocOpen] = useState(false);
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
      {/* ── The menu ──
          It was ten unstyled links floating under an 11px grey label, an
          active state that was a pale wash, and a hairline above "Official
          Docs" that light mode could not render — nothing said it was one
          thing, or which part of it you were in.

          ⚠️ THE ACTIVE ROW IS MARKED BY A RULE ON ITS EDGE, NOT BY A TINT. A
          background wash needs enough contrast to be seen and little enough
          not to fight the text; on white that leaves almost no room, which is
          why the old one read as a smudge. A 2px bar in the accent is legible
          in both themes at any weight. */}
      <aside className='hidden w-56 flex-shrink-0 lg:block'>
        <nav
          className='sticky top-20 min-[1100px]:top-[104px]'
          aria-label='On this page'
        >
          <div className='card overflow-hidden p-1.5'>
            <p className='section-heading px-2.5 pb-1.5 pt-2'>On this page</p>
            <ul>
              {SECTIONS.map(({ id, label }) => {
                const active = activeSection === id;
                return (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      aria-current={active ? 'true' : undefined}
                      data-testid={`docs-nav-${id}`}
                      className={`block border-l-2 py-1.5 pl-2.5 pr-2 text-[14.5px] transition-colors ${
                        active
                          ? 'border-brand-600 bg-ink/[0.04] font-medium text-neutral-100'
                          : 'border-transparent text-neutral-500 hover:border-line-strong hover:text-neutral-200'
                      }`}
                    >
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <a
            href='https://docs.calimero.network'
            target='_blank'
            rel='noopener noreferrer'
            className='mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] text-neutral-500 transition-colors hover:bg-ink/[0.04] hover:text-neutral-300'
          >
            <ExternalLink className='h-3 w-3 flex-shrink-0' />
            Official Docs
          </a>
        </nav>
      </aside>

      {/* ── Content ── */}
      {/* ⚠️ `divide-y` RATHER THAN A BORDER ON EACH SECTION: the last section
          would otherwise carry a rule with nothing under it, and the first
          would need a special case. The rule sits in the line token, so it is
          visible on paper — the hairline it replaces was 6% ink on white. */}
      <div className='min-w-0 flex-1 animate-fade-in divide-y divide-line pb-16 [&>section]:py-12 [&>section:first-of-type]:pt-0'>
        {/* ⚠️ THE TABLE OF CONTENTS IS `hidden lg:block` ABOVE, AND THIS PAGE
            IS 25,000px TALL. Below `lg` that left a phone with one continuous
            scroll and no way to reach a section — the rail's own menu does
            not list them. Same list, as a disclosure, so it costs one row
            when it is not wanted. */}
        <nav className='lg:hidden' aria-label='On this page'>
          <button
            type='button'
            onClick={() => setTocOpen(v => !v)}
            aria-expanded={tocOpen}
            data-testid='docs-toc-toggle'
            className='flex w-full items-center justify-between rounded-lg border border-line bg-ink/[0.02] px-3.5 py-2.5 text-[15px] text-neutral-300'
          >
            On this page
            <ChevronDown
              className={`h-4 w-4 text-neutral-500 transition-transform duration-200 ${
                tocOpen ? 'rotate-180' : ''
              }`}
              aria-hidden='true'
            />
          </button>
          {tocOpen && (
            <ul
              data-testid='docs-toc'
              className='mt-1.5 space-y-0.5 rounded-lg border border-line bg-ink/[0.02] p-1.5'
            >
              {SECTIONS.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    // Closing on the way out: the list covers the top of the
                    // page it just scrolled you to otherwise.
                    onClick={() => setTocOpen(false)}
                    className='block rounded-md px-3 py-2 text-[15px] text-neutral-400 transition-colors hover:bg-ink/[0.04] hover:text-neutral-200'
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>

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
      │  meroctl app pack --key ...   │  (builds, signs, packs)      │
      │                               │                              │
      │──── meroctl app publish ─────▶│                              │
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
              <Code>meroctl</Code>. These are the pieces you will touch:
            </P>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2'>
              {[
                {
                  icon: Terminal,
                  title: 'meroctl',
                  desc: 'Core’s command line. Starts an app, builds it, runs its tests, signs and packs the .mpk, and publishes it here.',
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
                  desc: 'Organization administration and metadata edits from the terminal. Publishing lives in meroctl.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className='card p-4'>
                  <div className='mb-2 flex items-center gap-2.5'>
                    {/* The icon in a tinted chip rather than loose on the
                        card. ⚠️ Still the accent, not four invented hues:
                        green already means something specific in this product
                        (verified, installed, selected), and a palette of
                        decorative colours beside it makes every one of those
                        meanings weaker. */}
                    <span className='flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600/[0.12]'>
                      <Icon className='h-3.5 w-3.5 text-brand-600' />
                    </span>
                    <span className='text-[15px] font-medium text-neutral-200'>
                      {title}
                    </span>
                  </div>
                  <p className='text-[14px] text-neutral-500 font-light'>
                    {desc}
                  </p>
                </div>
              ))}
            </div>
            <Note>
              <strong>Coming from the old flow?</strong> Hand-rolled{' '}
              <Code>build.sh</Code> scripts, <Code>cargo mero</Code>, standalone{' '}
              <Code>mero-sign</Code>, and{' '}
              <Code>calimero-registry bundle create</Code> /{' '}
              <Code>bundle push</Code> are all replaced by <Code>meroctl</Code>{' '}
              (1.0.0-rc.24 or later). Key generation and signing are{' '}
              <Code>meroctl app signer</Code> and <Code>meroctl app sign</Code>,
              and existing key files keep working, so nothing you signed before
              stops verifying.
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
              <Code>meroctl app pack</Code> writes the app component at the
              archive root, with its compute component, pipelines and frontend
              when the app has them:
            </P>
            <CodeBlock>{`bundle.mpk  (tar.gz)
├── manifest.json        signed
├── app.wasm             the app component
├── compute.wasm         when the app has compute methods
├── pipelines/*.yaml     any --pipeline files
└── frontend/...         a static frontend, when the app ships one`}</CodeBlock>
            <P>
              Bundles published with older toolchains keep their own layout: a
              root <Code>app.wasm</Code> beside an <Code>abi.json</Code>, or
              several services under <Code>services/</Code>.
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
              An older multi-service bundle replaces the top-level{' '}
              <Code>wasm</Code> and <Code>abi</Code> with a{' '}
              <Code>services</Code> array, one entry per service:
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
              <Code>meroctl app pack</Code> generates it from the app
              crate&apos;s <Code>Cargo.toml</Code>: its <Code>version</Code> and
              a <Code>[package.metadata.calimero]</Code> table.
            </P>
            <CodeBlock>{`[package]
name = "my-app"
version = "1.2.4"                       # the app version

[package.metadata.calimero]
package = "com.example.my-app"          # required, the app id
min-runtime-version = "1.0.0"           # the oldest node release that runs it
frontend-dir = "../app/dist"            # optional: a built frontend to ship

# how the registry lists it (see Required Metadata)
name = "My App"
description = "A short sentence that says what the app actually does."
icon = "assets/icon.png"                # PNG, relative to the crate
category = "productivity"
tags = ["crdt", "offline"]
license = "MIT"

slug = "my-app"                         # default: the package id
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
                  'min-runtime-version',
                  'The oldest node release that runs the app. Override with --min-runtime-version.',
                ],
                [
                  'frontend-dir',
                  'A built static frontend, relative to the crate, shipped as frontend/ and checked with the node’s rules. Override with --frontend, or leave it out with --no-frontend.',
                ],
                [
                  'name, description, icon, category',
                  'The listing metadata a new package needs. icon is read into a data: URI; tags, author, license and guide (a file whose text ships) are optional. Without a crate: --name, --description, --icon, --category.',
                ],
                [
                  'slug, links',
                  'slug is the deep-link handler (calimero://<slug>/...), defaulting to the package id. frontend, github and docs become links; frontend-aliases keeps an old frontend origin signing in.',
                ],
                [
                  'appVersion',
                  'Not a metadata key. The crate’s [package] version as written; override with --app-version (needed when the crate inherits its version from the workspace).',
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
            MEROCTL
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='meroctl'>meroctl</SectionHeading>
          <div className='space-y-4'>
            <P>
              <strong className='text-neutral-200'>meroctl</strong> is
              Calimero&apos;s one command line. Its <Code>app</Code> commands
              cover the whole path from an empty directory to a published
              bundle, and replace the hand-written build and packaging scripts
              apps used to carry. They need 1.0.0-rc.24 or later.
            </P>

            <SubHeading>Installation</SubHeading>
            <P>
              meroctl ships with every{' '}
              <a
                href='https://github.com/calimero-network/core/releases'
                target='_blank'
                rel='noreferrer'
                className='text-brand-600 transition-colors hover:text-brand-500'
              >
                core release
              </a>
              , alongside merod, for Linux (x86_64, aarch64) and macOS
              (aarch64). The install script checks the archive against the
              release&apos;s <Code>SHA256SUMS</Code>:
            </P>
            <CodeBlock>{`# into ~/.local/bin (CALIMERO_INSTALL_DIR or --dir to change it)
curl -fsSL https://raw.githubusercontent.com/calimero-network/core/master/scripts/install.sh | sh

# a fixed release
curl -fsSL https://raw.githubusercontent.com/calimero-network/core/master/scripts/install.sh \\
  | sh -s -- --version 1.0.0-rc.24

# apps build for wasm32-wasip2
rustup target add wasm32-wasip2`}</CodeBlock>
            <Note>
              <Code>meroctl --version</Code> prints the release and the commit
              it was built from. CI should install a pinned release; see{' '}
              <a href='#ci' className='text-brand-600 hover:text-brand-500'>
                Publishing from CI
              </a>
              .
            </Note>

            <SubHeading>The workflow</SubHeading>
            <P>
              Five steps, start to finish. <Code>app new</Code> puts the app
              crate in <Code>apps/&lt;template&gt;/logic</Code>; set your own{' '}
              <Code>package</Code> in its <Code>Cargo.toml</Code> before you
              publish.
            </P>
            <CodeBlock>{`meroctl app new my-app && cd my-app          # 1. start from the kv-store template
meroctl app build apps/kv-store/logic        # 2. build the app component
meroctl local test apps/kv-store/logic       # 3. run the app crate's tests
meroctl app pack apps/kv-store/logic --key k.json   # 4. build, write + sign manifest, pack .mpk
meroctl app publish apps/kv-store/logic/dist/<package>-<version>.mpk   # 5. push to the registry`}</CodeBlock>
            <FieldList
              width='sm:w-28'
              rows={[
                [
                  'app new',
                  'Starts a project from a template in calimero-network/apps (default kv-store; --template picks another). The directory must not exist or be empty.',
                ],
                [
                  'app build',
                  'Builds the crate into a calimero:app component (wasm32-wasip2), and its compute component when it has compute methods.',
                ],
                [
                  'local test',
                  'Runs cargo test in the app crate, its scenario harness included.',
                ],
                [
                  'app pack',
                  'Builds the components, writes manifest.json, signs it, and packs a tar.gz .mpk at <crate>/dist/<package>-<appVersion>.mpk.',
                ],
                [
                  'app publish',
                  'Uploads a signed .mpk to the registry. Needs CALIMERO_REGISTRY_API_KEY or --api-key.',
                ],
              ]}
            />
            <P>
              <Code>meroctl app inspect</Code> opens a bundle the way a node
              does and prints its manifest and signer.
            </P>

            <SubHeading>Useful pack flags</SubHeading>
            <CodeBlock>{`--key <file>              sign with a production key (required to publish)
                          without it: the well-known development key, which the registry refuses
--app-version <v>         override the crate's version
--package <id>            override the package id
--out <path>              override <crate>/dist/<package>-<appVersion>.mpk
--previous <old.mpk>      report ABI changes against the last release first
--wasm <f> --compute <f>  pack components you built yourself
--frontend <dir>          ship a static web build as frontend/
--outbound <url>          an https:// prefix the app's runs may call (repeatable)`}</CodeBlock>
            <Note>
              The version is the crate&apos;s or <Code>--app-version</Code>;
              nothing asks the registry for the next one. The registry refuses a
              version that is not greater than the latest published one.
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
                  'The development key: a single well-known key baked into the tool, derived from a fixed seed, used when pack gets no --key and by app sign --dev, so every bundle signed with it shares one signer. The analogue of Android’s debug.keystore: fine for local installs, proves nothing about provenance. The registry refuses it.',
                ],
                [
                  '--key',
                  'A private Ed25519 key only you hold. Required for anything published here. Generate with meroctl app signer new.',
                ],
              ]}
            />

            <SubHeading>Generating a key</SubHeading>
            <CodeBlock>{`meroctl app signer new my-key.json
# Generated new keypair: my-key.json
#   signerId: did:key:z6MkrV2imerTHzYtPyb2groFVNJSokGX7rpxnuJj8DSEQDnH

# inspect an existing key without signing anything
meroctl app signer id my-key.json`}</CodeBlock>
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
              <Code>meroctl app pack</Code> does this as part of packaging.{' '}
              <Code>meroctl app sign</Code> does it to an existing{' '}
              <Code>manifest.json</Code> in place, which is what a metadata edit
              needs. The registry re-runs the exact same process on every
              upload; a mismatch returns <Code>400 invalid_signature</Code>.
            </P>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            REQUIRED METADATA
        ══════════════════════════════════════════ */}
        <section>
          <SectionHeading id='metadata'>Required Metadata</SectionHeading>
          <div className='space-y-4'>
            <P>
              The registry checks a bundle's metadata at upload and refuses an
              incomplete one, the same way it refuses a version that is not
              greater than the last. The check runs server-side, so it applies
              identically whether you publish with{' '}
              <Code>meroctl app publish</Code>, an API token, or the upload form
              on this site.
            </P>

            <SubHeading>What a new package must carry</SubHeading>
            <FieldList
              width='w-44'
              rows={[
                [
                  'metadata.name',
                  'The title shown in the registry and the desktop launcher. Up to 64 characters.',
                ],
                [
                  'metadata.description',
                  'At least 20 characters. Say what the app does — a description that just restates the name is rejected.',
                ],
                [
                  'metadata.icon',
                  'A square PNG, at least 512×512, inlined as a data URI.',
                ],
                [
                  'metadata.category',
                  'Exactly one of the ten categories below.',
                ],
                [
                  'metadata.license',
                  'Recommended, not required. An SPDX identifier such as MIT.',
                ],
              ]}
            />

            <SubHeading>Categories</SubHeading>
            <P>
              One per app, from a closed list — the category is what the
              registry and the desktop launcher browse by. Free-form{' '}
              <Code>tags</Code> stay open alongside it and are what search uses,
              so put <Code>multiplayer</Code> or <Code>crdt</Code> there rather
              than inventing a category.
            </P>
            <CodeBlock>{`games          productivity   communication  social      art-design
media          planning       security       utilities   developer-tools`}</CodeBlock>

            <SubHeading>Two fields the registry sets for you</SubHeading>
            <P>
              <Code>publishedAt</Code> and <Code>installSize</Code> are stamped
              by the server at upload — the release timestamp, and the measured
              size of the <Code>.mpk</Code> as received. They are not read from
              the manifest: a self-declared size or date cannot be verified and
              drifts from reality. Both appear on the listing API and the app
              page.
            </P>

            <SubHeading>Existing packages are not broken by this</SubHeading>
            <P>
              A package that already has a published version keeps publishing
              even if it is missing something. The response carries a{' '}
              <Code>warnings</Code> array naming each gap, so a release pipeline
              can surface it without failing. Only a brand-new package is
              rejected outright, with every problem listed at once rather than
              one per attempt:
            </P>
            <CodeBlock>{`{
  "error": "metadata_incomplete",
  "message": "This bundle is missing metadata the registry requires of a new package:\n  - \`metadata.icon\` is missing.\n  - \`metadata.category\` is missing. Pick exactly one of: games, productivity, ...",
  "problems": ["..."],
  "categories": ["games", "productivity", "communication", "social",
                 "art-design", "media", "planning", "security",
                 "utilities", "developer-tools"]
}`}</CodeBlock>

            <SubHeading>Where it comes from</SubHeading>
            <P>
              The metadata travels inside the signed manifest, so what the
              registry shows is what the publisher signed.{' '}
              <Code>meroctl app pack</Code> writes it from the crate&apos;s{' '}
              <Code>[package.metadata.calimero]</Code>:
            </P>
            <CodeBlock>{`[package.metadata.calimero]
package = "com.example.my-app"
name = "My App"
description = "A short sentence that says what the app actually does."
icon = "app/public/icon-512.png"   # square PNG, >= 512x512
category = "productivity"
tags = ["crdt", "offline"]
license = "MIT"`}</CodeBlock>
            <P>
              Without a crate, <Code>--name</Code>, <Code>--description</Code>,{' '}
              <Code>--icon</Code> and <Code>--category</Code> set the same
              fields. <Code>icon = "default"</Code>, the old placeholder, packs
              no icon, and the registry rejects a generic placeholder mark by
              content hash — "the field is set" is not the check.
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
                    <CodeBlock>{`export CALIMERO_REGISTRY_API_KEY=<token>   # meroctl app publish
export CALIMERO_API_KEY=<token>            # calimero-registry`}</CodeBlock>
                  </>,
                ],
              ]}
            />

            <SubHeading>Publishing from the terminal</SubHeading>
            <CodeBlock>{`# 1. build and sign; the version is the crate's
meroctl app pack logic --key my-key.json
# → logic/dist/com.example.my-app-1.2.4.mpk

# 2. publish
export CALIMERO_REGISTRY_API_KEY=<token>
meroctl app publish logic/dist/com.example.my-app-1.2.4.mpk`}</CodeBlock>
            <P>
              The registry defaults to{' '}
              <Code>https://apps.calimero.network</Code>. Point at another one
              with <Code>CALIMERO_REGISTRY_URL</Code> or <Code>--registry</Code>
              . A Calimero Cloud organization publishes with{' '}
              <Code>--org &lt;org&gt;</Code> and its <Code>ck_live_</Code> API
              key, which meroctl trades at the Cloud for a short publish token;
              its new packages are private unless you pass <Code>--public</Code>
              .
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
                  'A manifest can also list additional owner keys, and the endpoint honours them: a push signed by a listed key is accepted and the version is stored. What it produces is the catch - ApplicationId comes from package + signerId, so that version belongs to a different application, and no node with the original installed will see it. meroctl app pack never writes the field and no published manifest carries one. The CI step above compares the signer directly for this reason, refusing what the endpoint would take.',
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
              authenticates with your session instead of an API key. If the
              package is linked to an org where you are an{' '}
              <strong className='text-neutral-200'>admin or owner</strong>, your
              own signing key is enough; the package&apos;s existing keys stay
              as they were.
            </P>
            <Note>
              <Upload className='inline w-3.5 h-3.5 text-brand-600 mr-1 -mt-0.5' />
              The browser upload, like <Code>meroctl app publish</Code>, refuses
              a version that is not greater than the latest published one (
              <Code>400 version_not_allowed</Code>).
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
meroctl app sign manifest.json --key my-key.json

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
              production key on their laptop. There are two ways to automate it,
              and they differ only in{' '}
              <strong className='text-neutral-200'>who owns the version</strong>
              .
            </P>

            <SubHeading>
              Let the registry own the version (recommended)
            </SubHeading>
            <P>
              The release pipeline asks the registry for the highest published{' '}
              <Code>appVersion</Code>, increments the patch, and builds that. No
              number is ever bumped by hand and two releases can never collide.
              This is what the Calimero apps monorepo does today. The trade is
              that there is no idempotency: re-running the job mints another
              version of the same content.
            </P>
            <CodeBlock>{`# Resolve the next version from the registry, not from Cargo.toml.
# An unreachable registry must NOT read as "nothing published" — that would
# reset the lineage and sign BELOW what is already out there.
response=$(curl -fsS --retry 3 --max-time 30 \
  "$CALIMERO_REGISTRY_URL/api/v2/bundles?package=$PACKAGE&all_versions=true") || exit 1
jq -e 'type == "array"' >/dev/null <<<"$response" || exit 1

version=$(jq -r '
  [ .[].appVersion // empty
    | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))
    | split(".") | map(tonumber) ]
  | sort
  | if length == 0 then "0.0.1" else (last | "\\(.[0]).\\(.[1]).\\(.[2]+1)") end
' <<<"$response")

meroctl app pack logic \\
  --key "$RUNNER_TEMP/key.json" \\
  --app-version "$version" \\
  --out "dist/$PACKAGE.mpk"

meroctl app publish "dist/$PACKAGE.mpk"`}</CodeBlock>

            <SubHeading>Or own the version in Cargo.toml</SubHeading>
            <P>
              The alternative makes{' '}
              <strong className='text-neutral-200'>
                bumping the version in <Code>Cargo.toml</Code> the release
              </strong>
              : merge that to your default branch and CI builds, signs, and
              publishes. It is idempotent — a re-run republishes the same number
              and the registry rejects it — but someone has to pick the number.
              The full workflow below shows this variant.
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
        ▼  read the crate version + the calimero package id
        │
        ▼  GET /api/v2/bundles/<package>/<version>
        │     404 → publish        200 → already released, stop
        │     anything else → fail (never republish on a blind guess)
        │
        ▼  install pinned meroctl, write the key from the secret
        │
        ▼  app signer id  ==  the package's published signerId?
        │     no → fail before signing anything
        │
        ▼  meroctl app pack --key ...   →   meroctl app publish`}</Diagram>
            <CodeBlock>{`name: Deploy Bundle

on:
  push:
    branches: [master]
    paths: ["logic/Cargo.toml"]     # the version lives here and nowhere else
  workflow_dispatch:

# One registry for every step, and the same variable meroctl reads.
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
          # The app crate is the one with [package.metadata.calimero]: a
          # workspace may also hold an xtask on its own version, which must
          # not decide a release. cargo metadata resolves an inherited version.
          app=$(jq -ec '[.packages[] | select(.metadata.calimero.package != null)]
            | if length == 1 then .[0]
              else error("expected one crate with [package.metadata.calimero]") end' <<<"$meta")
          package=$(jq -er '.metadata.calimero.package' <<<"$app")
          version=$(jq -er '.version' <<<"$app")

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
          # the latest, and publishing cannot be undone. all_versions includes
          # yanked releases, which the plain listing skips, and lists newest
          # first.
          latest=$(curl -fsS --max-time 30 \\
            "$CALIMERO_REGISTRY_URL/api/v2/bundles?package=$PACKAGE&all_versions=true" \\
            | jq -er '.[0].appVersion // ""') || {
              echo "::error::could not read the published versions"; exit 1; }

          # Build metadata carries no precedence, so drop it first.
          v=\${VERSION%%+*}; l=\${latest%%+*}

          # sort -V ranks a pre-release after its own release, the opposite of
          # semver. That shape needs no comparison: a pre-release is always
          # older than its release.
          if [ -z "$latest" ]; then
            :
          elif [ "$v" = "$l" ]; then
            # Same version by precedence: the 404 above compared strings only.
            echo "::error::$VERSION differs from $latest only in build metadata"; exit 1
          elif [ "\${v%%-*}" = "\${l%%-*}" ] \\
               && [ "$v" != "\${v%%-*}" ] && [ "$l" = "\${l%%-*}" ]; then
            echo "::error::$VERSION is a pre-release of the published $latest"; exit 1
          elif [ "\${v%%-*}" = "\${l%%-*}" ] \\
               && [ "$v" = "\${v%%-*}" ] && [ "$l" != "\${l%%-*}" ]; then
            :
          elif [ "$(printf '%s\\n%s\\n' "$v" "$l" | sort -V | tail -1)" != "$v" ]; then
            echo "::error::$VERSION is not newer than the published $latest"; exit 1
          fi

          echo "publish=true" >> "$GITHUB_OUTPUT"

  deploy:
    needs: check
    if: needs.check.outputs.publish == 'true'
    runs-on: ubuntu-latest
    # Through the environment, never inlined: a template expression is
    # substituted before the shell sees it, so a crafted value would run.
    env:
      PACKAGE: \${{ needs.check.outputs.package }}
      VERSION: \${{ needs.check.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with: { targets: wasm32-wasip2 }
      - uses: ./.github/actions/setup-meroctl

      - name: Write signing key
        env:
          MERO_SIGN_KEY: \${{ secrets.MERO_SIGN_KEY }}
        run: |
          umask 077
          printf '%s' "$MERO_SIGN_KEY" > "$RUNNER_TEMP/key.json"

      - name: Verify the signer still matches the published package
        run: |
          signer=$(meroctl app signer id "$RUNNER_TEMP/key.json")

          # Separate "could not ask" from "nothing published": reading the
          # failure as an empty listing skips this very check.
          if ! listing=$(curl -fsS --retry 3 --max-time 30 \\
              "$CALIMERO_REGISTRY_URL/api/v2/bundles?package=$PACKAGE&all_versions=true"); then
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
        # The package and version the check job gated on, so the bundle
        # cannot carry anything else; --out keeps the path in one place.
        run: |
          meroctl app pack logic --key "$RUNNER_TEMP/key.json" \\
            --package "$PACKAGE" --app-version "$VERSION" \\
            --out "$RUNNER_TEMP/bundle.mpk"

      - name: Remove signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/key.json"

      - run: meroctl app publish "$RUNNER_TEMP/bundle.mpk"
        env:
          CALIMERO_REGISTRY_API_KEY: \${{ secrets.CALIMERO_REGISTRY_API_KEY }}`}</CodeBlock>

            <SubHeading>The gate answers one question</SubHeading>
            <P>
              The probe asks whether <strong>this exact version</strong> exists,
              which is what makes the job idempotent across re-runs. It does not
              ask whether the version is newer than what is already out.
            </P>
            <P>
              Reverting <Code>1.2.0</Code> to <Code>1.1.0</Code>, or resolving a
              merge conflict the wrong way, produces a version the registry has
              never seen: the probe returns 404. The push endpoint{' '}
              <Code>meroctl app publish</Code> uses refuses it (
              <Code>400 version_not_allowed</Code>), but only after the job has
              built and signed it.
            </P>
            <Note>
              So the <Code>check</Code> job compares against the highest
              published version too - the listing is already sorted newest-first
              by semver, so <Code>.[0].appVersion</Code> is the value to beat.
              Not with plain <Code>sort -V</Code>, though: it orders{' '}
              <Code>1.0.0-rc.1</Code> after <Code>1.0.0</Code>, the opposite of
              semver, which is why the job decides that shape directly.
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
              Install a released <Code>meroctl</Code> at a fixed version with a
              checksum. The tool writes what goes inside the bundle, so letting
              it float means a release can change shape without anything in your
              repository changing. The install script with{' '}
              <Code>--version</Code> checks the release&apos;s{' '}
              <Code>SHA256SUMS</Code>; pinning each archive&apos;s checksum in
              your repository also catches an asset re-uploaded under the same
              tag.
            </P>
            <CodeBlock>{`RELEASE=1.0.0-rc.24

# Per-asset SHA-256, copied from the release's SHA256SUMS, so a re-uploaded
# asset under the same tag cannot swap the binary silently. Refresh these
# together with RELEASE.
CHECKSUM_x86_64_unknown_linux_gnu=<sha256 of meroctl_x86_64-unknown-linux-gnu.tar.gz>
CHECKSUM_aarch64_apple_darwin=<sha256 of meroctl_aarch64-apple-darwin.tar.gz>

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) TARGET=x86_64-unknown-linux-gnu ;;
  Darwin/arm64) TARGET=aarch64-apple-darwin ;;
  *) echo "no meroctl checksum pinned for $(uname -s)/$(uname -m)" >&2; exit 1 ;;
esac
eval "EXPECTED=\\$CHECKSUM_\${TARGET//-/_}"

url="https://github.com/calimero-network/core/releases/download/$RELEASE/meroctl_$TARGET.tar.gz"
curl -fsSL "$url" -o meroctl.tar.gz

# Verified before unpacking: a tarball that fails the check should never reach
# PATH, let alone run. Without this the checksum above is decoration.
echo "$EXPECTED  meroctl.tar.gz" | shasum -a 256 -c - \\
  || { echo "checksum mismatch for $url" >&2; exit 1; }

mkdir -p "$HOME/.local/bin"
tar -xzf meroctl.tar.gz -C "$HOME/.local/bin" meroctl`}</CodeBlock>
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
    Bundle carries the package's signing key, not Alice's own
    Auth: Google session resolves → alice@example.com
    Registry: is alice@example.com in "my-org"?   YES  → 201 Created

  After an admin removes alice:
    Registry: is alice@example.com in "my-org"?   NO   → 403 Forbidden`}</Diagram>
            <Note>
              <Building2 className='inline w-3.5 h-3.5 text-brand-600 mr-1 -mt-0.5' />
              Membership decides <strong>who may operate the package</strong>,
              not what signs the bundle, and the two are not interchangeable:{' '}
              <Code>ApplicationId</Code> comes from <Code>package</Code> and{' '}
              <Code>signerId</Code>, so a member uploading under their own key
              mints a different application rather than a new version - accepted
              by the registry, invisible to every existing install. A package
              has one signing key; hold it as an org secret and let a bot
              account publish with it. Membership stays the thing you revoke,
              which takes effect immediately and needs no key rotation.
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
                  'Invite members by username',
                  'On the org detail page, enter a username and a role. The invitee accepts from their Organizations page before they join.',
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
              edits. Building and publishing bundles is <Code>meroctl</Code>
              &apos;s job.
            </P>

            <SubHeading>Installation and configuration</SubHeading>
            <CodeBlock>{`npm install -g @calimero-network/registry-cli

# save the defaults once
calimero-registry config set registry-url https://apps.calimero.network
calimero-registry config set api-key   # paste the token when asked

# or per-session (meroctl app publish reads CALIMERO_REGISTRY_URL too,
# but takes the token from CALIMERO_REGISTRY_API_KEY)
export CALIMERO_REGISTRY_URL=https://apps.calimero.network
export CALIMERO_API_KEY=<token>`}</CodeBlock>

            <SubHeading>Organization commands</SubHeading>
            <CodeBlock>{`# organizations (list resolves your email from the token)
calimero-registry org list
calimero-registry org create -n "My Org" -s "my-org"
calimero-registry org get    <org-id>                    # public
calimero-registry org update <org-id> --name "New Name"
calimero-registry org delete <org-id>

# members, by username; an invitee joins once they accept
calimero-registry org members list   <org-id>            # public
calimero-registry org members add    <org-id> alice --role member
calimero-registry org members update <org-id> alice --role admin
calimero-registry org members remove <org-id> alice

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
              exist for bundles built outside the Rust toolchain, but{' '}
              <Code>meroctl app publish</Code> replaces their publish path. Use{' '}
              <Code>meroctl app pack</Code> and <Code>meroctl app publish</Code>{' '}
              for anything built from a Calimero app crate.
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
            <CodeBlock>{`# a published release, from the node's registry
meroctl app install com.example.my-app@1.2.4

# a local file, on a development cluster only
meroctl app install --path dist/com.example.my-app-1.2.4.mpk`}</CodeBlock>
            <P>
              <Code>meroctl</Code> and <Code>merod</Code> ship from the same{' '}
              <a
                href='https://github.com/calimero-network/core/releases'
                target='_blank'
                rel='noreferrer'
                className='text-brand-600 transition-colors hover:text-brand-500'
              >
                core releases
              </a>
              , and the install script installs either (
              <Code>sh -s -- merod meroctl</Code>; merod is Linux only). Keep
              them on the release your app&apos;s SDK targets: they share the
              manifest format, and a node older than the SDK an app was built
              against installs the bundle happily and then fails at context
              creation with <Code>link error: unknown import</Code>.
            </P>

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
              <p className='text-[14px] text-neutral-500 font-light'>
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
