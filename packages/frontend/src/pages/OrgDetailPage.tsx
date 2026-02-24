import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getOrg,
  getOrgMembers,
  getOrgPackages,
} from '@/lib/api';
import {
  Building2,
  ArrowLeft,
  Users,
  Package,
  ArrowUpRight,
  Shield,
} from 'lucide-react';

export default function OrgDetailPage() {
  const { orgId = '' } = useParams<{ orgId: string }>();
  const decodedOrgId = decodeURIComponent(orgId);

  const { data: org, isLoading: orgLoading, error: orgError } = useQuery({
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

      {/* Members */}
      <div>
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
                  <th className='text-left py-3 px-4 font-medium text-neutral-300'>
                    Pubkey
                  </th>
                  <th className='text-left py-3 px-4 font-medium text-neutral-300 w-24'>
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr
                    key={m.pubkey}
                    className='border-b border-neutral-800/80 last:border-0'
                  >
                    <td className='py-2.5 px-4 font-mono text-neutral-400 truncate max-w-[280px]'>
                      {m.pubkey}
                    </td>
                    <td className='py-2.5 px-4'>
                      {m.role === 'admin' ? (
                        <span className='inline-flex items-center gap-1 pill bg-amber-500/10 text-amber-500'>
                          <Shield className='w-3 h-3' />
                          admin
                        </span>
                      ) : (
                        <span className='pill bg-neutral-700/50 text-neutral-400'>
                          member
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className='mt-2 text-[11px] text-neutral-600'>
          To add or remove members, use the CLI with a keypair (signed requests).
        </p>
      </div>

      {/* Linked packages */}
      <div>
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
                  className='flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 group hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors'
                >
                  <span className='text-[13px] font-mono text-neutral-300 truncate'>
                    {pkg}
                  </span>
                  <ArrowUpRight className='w-3.5 h-3.5 text-neutral-500 group-hover:text-brand-600 flex-shrink-0 ml-2' />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className='mt-2 text-[11px] text-neutral-600'>
          To link or unlink packages, use the CLI with a keypair (signed
          requests).
        </p>
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
