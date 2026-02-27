import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getOrg,
  getOrgMembers,
  getOrgPackages,
  getMyOrgPubkeyBase64url,
} from '@/lib/api';
import {
  Building2,
  ArrowLeft,
  Users,
  Package,
  ArrowUpRight,
  Shield,
  Terminal,
  Globe,
  Mail,
  Github,
  Twitter,
  MapPin,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

export default function OrgDetailPage() {
  const { orgId = '' } = useParams<{ orgId: string }>();
  const decodedOrgId = decodeURIComponent(orgId);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  useEffect(() => {
    getMyOrgPubkeyBase64url().then(setMyPubkey);
  }, []);

  const {
    data: org,
    isLoading: orgLoading,
    error: orgError,
  } = useQuery({
    queryKey: ['org', decodedOrgId],
    queryFn: () => getOrg(decodedOrgId),
    enabled: !!decodedOrgId,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', decodedOrgId],
    queryFn: () => getOrgMembers(decodedOrgId),
    enabled: !!decodedOrgId && !!org,
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['org-packages', decodedOrgId],
    queryFn: () => getOrgPackages(decodedOrgId),
    enabled: !!decodedOrgId && !!org,
  });

  const members = membersData?.members ?? [];
  const packages = packagesData?.packages ?? [];
  const isAdmin =
    !!myPubkey &&
    members.some(m => m.pubkey === myPubkey && m.role === 'admin');
  const isMember = !!myPubkey && members.some(m => m.pubkey === myPubkey);

  const handleCopyCmd = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const isLoading = orgLoading;
  const notFound = !orgLoading && (orgError || !org);

  if (isLoading) {
    return (
      <div className='space-y-5 animate-pulse'>
        <div className='h-4 bg-neutral-800 rounded w-24' />
        <div className='h-6 bg-neutral-800 rounded w-1/3' />
        <div className='h-3.5 bg-neutral-800 rounded w-1/4' />
        <div className='h-24 bg-neutral-800/50 rounded-xl' />
        <div className='h-32 bg-neutral-800/50 rounded-xl' />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className='space-y-6'>
        <BackLink />
        <div className='text-center py-16'>
          <Building2 className='mx-auto h-8 w-8 text-neutral-600' />
          <p className='mt-3 text-[13px] text-neutral-400'>
            Organization not found.
          </p>
          <Link
            to='/orgs'
            className='mt-4 inline-block text-brand-600 text-sm hover:underline'
          >
            Back to Organizations
          </Link>
        </div>
      </div>
    );
  }

  const m = org!.metadata ?? {};
  const hasOrgInfo = !!(
    m.description ||
    m.website ||
    m.email ||
    m.github ||
    m.twitter ||
    m.location
  );

  return (
    <div className='space-y-6'>
      <BackLink />

      {/* Header */}
      <div className='flex items-center gap-3'>
        <div className='flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800'>
          <Building2 className='w-4 h-4 text-neutral-400' />
        </div>
        <div>
          <h1 className='text-xl font-semibold text-neutral-100'>
            {org!.name}
          </h1>
          <p className='text-[12px] text-neutral-500 font-mono'>
            {org!.slug || org!.id}
          </p>
        </div>
      </div>

      {/* Member notice — regular member (non-admin) */}
      {isMember && !isAdmin && (
        <div className='rounded-lg border border-brand-900/50 bg-brand-950/20 px-4 py-3 flex gap-3'>
          <Users className='w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5' />
          <div className='space-y-1'>
            <p className='text-[13px] text-neutral-200 font-medium'>
              You are a member of this organization
            </p>
            <p className='text-[12px] text-neutral-400'>
              As a member you can publish new versions and edit metadata for any
              of the{' '}
              {packages.length > 0 ? (
                <strong className='text-neutral-300'>{packages.length}</strong>
              ) : (
                'linked'
              )}{' '}
              package{packages.length !== 1 ? 's' : ''} linked to this org via
              the CLI. Package deletion and org management require admin access.
            </p>
          </div>
        </div>
      )}

      {/* Admin notice — use CLI for write ops */}
      {isAdmin && (
        <AdminCliNotice orgId={decodedOrgId} onCopy={handleCopyCmd} copiedCmd={copiedCmd} />
      )}

      {/* Members */}
      <section>
        <p className='section-heading mb-3'>
          <Users className='w-3.5 h-3.5 inline mr-1.5' />
          Members
        </p>

        {membersLoading ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 animate-pulse'>
            <div className='h-10 bg-neutral-800/50 rounded mb-2' />
            <div className='h-10 bg-neutral-800/50 rounded' />
          </div>
        ) : members.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-[13px] text-neutral-500'>
            No members listed.
          </div>
        ) : (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden'>
            <table className='w-full text-[13px]'>
              <thead>
                <tr className='border-b border-neutral-800 bg-neutral-800/30'>
                  <th className='text-left py-3 px-5 font-medium text-neutral-300'>
                    Pubkey
                  </th>
                  <th className='text-left py-3 px-5 font-medium text-neutral-300 w-28'>
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr
                    key={member.pubkey}
                    className='border-b border-neutral-800/80 last:border-0'
                  >
                    <td className='py-3 px-5 font-mono text-neutral-400 truncate max-w-[280px]'>
                      {member.pubkey}
                      {member.pubkey === myPubkey && (
                        <span className='ml-2 text-[10px] text-brand-600 font-sans'>
                          (you)
                        </span>
                      )}
                    </td>
                    <td className='py-3 px-5'>
                      {member.role === 'admin' ? (
                        <span className='inline-flex items-center gap-1 pill bg-amber-500/10 text-amber-500'>
                          <Shield className='w-3 h-3' />
                          Admin
                        </span>
                      ) : (
                        <span className='pill bg-neutral-700/50 text-neutral-400'>
                          Member
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Linked packages */}
      <section>
        <p className='section-heading mb-3'>
          <Package className='w-3.5 h-3.5 inline mr-1.5' />
          Linked packages
        </p>

        {packagesLoading ? (
          <div className='space-y-2 animate-pulse'>
            <div className='h-10 bg-neutral-800/50 rounded-xl' />
            <div className='h-10 bg-neutral-800/50 rounded-xl' />
          </div>
        ) : packages.length === 0 ? (
          <div className='rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-[13px] text-neutral-500'>
            No packages linked to this org.
          </div>
        ) : (
          <ul className='space-y-2'>
            {packages.map(pkg => (
              <li key={pkg}>
                <Link
                  to={`/apps/${encodeURIComponent(pkg)}`}
                  className='flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 group hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'
                >
                  <span className='flex-1 min-w-0 text-[13px] font-mono text-neutral-300 truncate'>
                    {pkg}
                  </span>
                  <ArrowUpRight className='w-3.5 h-3.5 text-neutral-500 group-hover:text-brand-600 flex-shrink-0' />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* About */}
      {hasOrgInfo && (
        <section>
          <p className='section-heading mb-3'>About</p>
          <div className='card p-4 space-y-2'>
            {m.description && (
              <p className='text-[13px] text-neutral-300 leading-relaxed mb-3'>
                {m.description}
              </p>
            )}
            {m.website && (
              <OrgInfoRow
                icon={Globe}
                label='Website'
                value={m.website}
                href={m.website}
              />
            )}
            {m.email && (
              <OrgInfoRow
                icon={Mail}
                label='Email'
                value={m.email}
                href={`mailto:${m.email}`}
              />
            )}
            {m.github && (
              <OrgInfoRow
                icon={Github}
                label='GitHub'
                value={m.github}
                href={m.github}
              />
            )}
            {m.twitter && (
              <OrgInfoRow
                icon={Twitter}
                label='Twitter / X'
                value={m.twitter}
                href={m.twitter}
              />
            )}
            {m.location && (
              <OrgInfoRow icon={MapPin} label='Location' value={m.location} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminCliNotice({
  orgId,
  onCopy,
  copiedCmd,
}: {
  orgId: string;
  onCopy: (cmd: string) => void;
  copiedCmd: string | null;
}) {
  const cmds = [
    {
      label: 'Add member',
      cmd: `calimero-registry org -k org-key.json members add ${orgId} <pubkey>`,
    },
    {
      label: 'Remove member',
      cmd: `calimero-registry org -k org-key.json members remove ${orgId} <pubkey>`,
    },
    {
      label: 'Link package',
      cmd: `calimero-registry org -k org-key.json packages link ${orgId} <package>`,
    },
    {
      label: 'Unlink package',
      cmd: `calimero-registry org -k org-key.json packages unlink ${orgId} <package>`,
    },
  ];

  return (
    <div className='rounded-lg border border-amber-900/50 bg-amber-950/10 px-4 py-4'>
      <div className='flex items-center gap-2 mb-3'>
        <Terminal className='w-4 h-4 text-amber-500 flex-shrink-0' />
        <p className='text-[13px] font-medium text-neutral-200'>
          Admin — manage via CLI
        </p>
      </div>
      <p className='text-[12px] text-neutral-400 mb-3'>
        You are an admin of this organization. All write operations use the CLI
        with your local{' '}
        <code className='bg-neutral-800 px-1 py-0.5 rounded text-neutral-300'>
          org-key.json
        </code>
        .
      </p>
      <div className='space-y-2'>
        {cmds.map(({ label, cmd }) => (
          <div
            key={label}
            className='flex items-center gap-2 rounded-lg bg-neutral-900/70 border border-neutral-800 px-3 py-2'
          >
            <span className='text-[11px] text-neutral-500 w-24 flex-shrink-0'>
              {label}
            </span>
            <code className='flex-1 text-[11px] text-neutral-300 font-mono truncate'>
              {cmd}
            </code>
            <button
              type='button'
              onClick={() => onCopy(cmd)}
              className='flex-shrink-0 text-neutral-500 hover:text-neutral-300 p-1 rounded transition-colors'
              title='Copy command'
            >
              {copiedCmd === cmd ? (
                <Check className='w-3.5 h-3.5 text-green-400' />
              ) : (
                <Copy className='w-3.5 h-3.5' />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to='/orgs'
      className='inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors'
    >
      <ArrowLeft className='w-3 h-3' />
      Back to Organizations
    </Link>
  );
}

function OrgInfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className='flex items-center gap-2.5 text-[13px]'>
      <Icon className='w-3.5 h-3.5 text-neutral-500 flex-shrink-0' />
      <span className='text-neutral-500 w-20 flex-shrink-0 text-[12px]'>
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          className='text-brand-500 hover:text-brand-400 hover:underline truncate inline-flex items-center gap-1 transition-colors'
        >
          {value}
          <ExternalLink className='w-3 h-3 flex-shrink-0' />
        </a>
      ) : (
        <span className='text-neutral-300 truncate'>{value}</span>
      )}
    </div>
  );
}
