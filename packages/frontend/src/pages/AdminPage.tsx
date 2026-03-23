import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Users,
  Package,
  Building2,
  Trash2,
  BadgeCheck,
  Ban,
  UserCheck,
  ShieldAlert,
  ShieldOff,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'users' | 'packages' | 'orgs';

interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  verified: boolean;
  adminVerified: boolean;
  isAdmin: boolean;
  isBlacklisted: boolean;
  createdAt: string | null;
}

interface AdminPackage {
  name: string;
  latestVersion: string;
  versionCount: number;
  author: string;
  verified: boolean;
  adminVerified: boolean;
  downloads: number;
}

interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  verified: boolean;
  adminVerified: boolean;
  createdAt: string | null;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (loading) {
    return <p className='text-neutral-500 text-sm'>Loading admin panel…</p>;
  }

  // Redirect if not admin
  if (!user || !user.isAdmin) {
    return <Navigate to='/' replace />;
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-3'>
        <ShieldCheck className='w-5 h-5 text-brand-500' />
        <div>
          <h1 className='text-xl font-semibold text-neutral-100'>
            Admin Panel
          </h1>
          <p className='text-[12px] text-neutral-500 font-light'>
            Direct registry management
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className='flex gap-1 border-b border-neutral-800'>
        {(
          [
            { key: 'users', label: 'Users', icon: Users },
            { key: 'packages', label: 'Packages', icon: Package },
            { key: 'orgs', label: 'Orgs', icon: Building2 },
          ] as {
            key: Tab;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }[]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setConfirmDelete(null);
              setTab(key);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Icon className='w-3.5 h-3.5' />
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <UsersTab
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
        />
      )}
      {tab === 'packages' && (
        <PackagesTab
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
        />
      )}
      {tab === 'orgs' && (
        <OrgsTab
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
        />
      )}
    </div>
  );
}

// ——— Users Tab ———

function UsersTab({
  confirmDelete,
  setConfirmDelete,
}: {
  confirmDelete: string | null;
  setConfirmDelete: (v: string | null) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [blacklistReasons, setBlacklistReasons] = useState<
    Record<string, string>
  >({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      api.get('/admin/users').then(r => r.data.users as AdminUser[]),
  });

  const mutate = useMutation({
    mutationFn: ({
      userId,
      action,
      reason,
    }: {
      userId: string;
      action: string;
      reason?: string;
    }) =>
      action === 'delete'
        ? api.delete(`/admin/users/${userId}`)
        : api.patch(`/admin/users/${userId}`, { action, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setConfirmDelete(null);
    },
  });

  const users = (data || []).filter(
    u =>
      !search || u.email.includes(search) || (u.username || '').includes(search)
  );

  return (
    <div className='space-y-3'>
      <input
        type='text'
        placeholder='Filter by email or username...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        className='input max-w-sm'
      />
      {isLoading ? (
        <div className='space-y-2'>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className='h-12 bg-neutral-800 rounded-lg animate-pulse'
            />
          ))}
        </div>
      ) : (
        <div className='space-y-1.5'>
          {users.map(u => (
            <div
              key={u.id}
              className='card px-4 py-3 flex flex-wrap items-center gap-3'
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-1.5'>
                  <span className='text-[13px] font-medium text-neutral-200 truncate'>
                    {u.username ? `@${u.username}` : u.email}
                  </span>
                  {u.verified && (
                    <BadgeCheck className='h-3.5 w-3.5 text-emerald-400 flex-shrink-0' />
                  )}
                  {u.isAdmin && (
                    <ShieldCheck className='h-3.5 w-3.5 text-brand-400 flex-shrink-0' />
                  )}
                  {u.isBlacklisted && (
                    <Ban className='h-3.5 w-3.5 text-red-400 flex-shrink-0' />
                  )}
                </div>
                <span className='text-[11px] text-neutral-500 font-mono'>
                  {u.email}
                </span>
              </div>
              <div className='flex items-center gap-1.5 flex-wrap'>
                {!u.email.endsWith('@calimero.network') && (
                  <>
                    <ActionBtn
                      label={u.adminVerified ? 'Unverify' : 'Verify'}
                      icon={u.adminVerified ? XCircle : CheckCircle}
                      color={u.adminVerified ? 'neutral' : 'green'}
                      onClick={() =>
                        mutate.mutate({
                          userId: u.id,
                          action: u.adminVerified ? 'unverify' : 'verify',
                        })
                      }
                    />
                    <ActionBtn
                      label={u.isAdmin ? 'Remove admin' : 'Make admin'}
                      icon={u.isAdmin ? ShieldOff : ShieldAlert}
                      color={u.isAdmin ? 'neutral' : 'blue'}
                      onClick={() =>
                        mutate.mutate({
                          userId: u.id,
                          action: u.isAdmin ? 'remove_admin' : 'make_admin',
                        })
                      }
                    />
                  </>
                )}
                {u.isBlacklisted ? (
                  <ActionBtn
                    label='Unban'
                    icon={UserCheck}
                    color='green'
                    onClick={() =>
                      mutate.mutate({ userId: u.id, action: 'unblacklist' })
                    }
                  />
                ) : !u.email.endsWith('@calimero.network') ? (
                  <div className='flex items-center gap-1'>
                    <input
                      type='text'
                      placeholder='Reason...'
                      value={blacklistReasons[u.id] ?? ''}
                      onChange={e =>
                        setBlacklistReasons(prev => ({
                          ...prev,
                          [u.id]: e.target.value,
                        }))
                      }
                      className='input text-[11px] py-1 px-2 h-7 w-28'
                    />
                    <ActionBtn
                      label='Ban'
                      icon={Ban}
                      color='red'
                      onClick={() =>
                        mutate.mutate({
                          userId: u.id,
                          action: 'blacklist',
                          reason: blacklistReasons[u.id] ?? '',
                        })
                      }
                    />
                  </div>
                ) : null}
                {confirmDelete === u.id ? (
                  <span className='flex items-center gap-1.5 text-[11px]'>
                    <span className='text-red-400'>Delete?</span>
                    <button
                      onClick={() =>
                        mutate.mutate({ userId: u.id, action: 'delete' })
                      }
                      className='text-red-400 hover:text-red-300 font-medium'
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className='text-neutral-500 hover:text-neutral-300'
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <ActionBtn
                    label='Delete'
                    icon={Trash2}
                    color='red'
                    onClick={() => setConfirmDelete(u.id)}
                  />
                )}
              </div>
            </div>
          ))}
          {!users.length && (
            <p className='text-[13px] text-neutral-500 text-center py-8'>
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ——— Packages Tab ———

function PackagesTab({
  confirmDelete,
  setConfirmDelete,
}: {
  confirmDelete: string | null;
  setConfirmDelete: (v: string | null) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-packages'],
    queryFn: () =>
      api.get('/admin/packages').then(r => r.data.packages as AdminPackage[]),
  });

  const mutate = useMutation({
    mutationFn: ({ name, action }: { name: string; action: string }) =>
      action === 'delete'
        ? api.delete(`/admin/packages/${encodeURIComponent(name)}`)
        : api.patch(`/admin/packages/${encodeURIComponent(name)}`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-packages'] });
      setConfirmDelete(null);
    },
  });

  const packages = (data || []).filter(
    p => !search || p.name.includes(search) || p.author.includes(search)
  );

  return (
    <div className='space-y-3'>
      <input
        type='text'
        placeholder='Filter by name or author...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        className='input max-w-sm'
      />
      {isLoading ? (
        <div className='space-y-2'>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className='h-12 bg-neutral-800 rounded-lg animate-pulse'
            />
          ))}
        </div>
      ) : (
        <div className='space-y-1.5'>
          {packages.map(p => (
            <div
              key={p.name}
              className='card px-4 py-3 flex flex-wrap items-center gap-3'
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-1.5'>
                  <span className='text-[13px] font-medium text-neutral-200 font-mono truncate'>
                    {p.name}
                  </span>
                  {p.verified && (
                    <BadgeCheck className='h-3.5 w-3.5 text-emerald-400 flex-shrink-0' />
                  )}
                </div>
                <span className='text-[11px] text-neutral-500'>
                  {p.author} · v{p.latestVersion} · {p.versionCount} version
                  {p.versionCount !== 1 ? 's' : ''} · {p.downloads} downloads
                </span>
              </div>
              <div className='flex items-center gap-1.5'>
                <ActionBtn
                  label={p.adminVerified ? 'Unverify' : 'Verify'}
                  icon={p.adminVerified ? XCircle : CheckCircle}
                  color={p.adminVerified ? 'neutral' : 'green'}
                  onClick={() =>
                    mutate.mutate({
                      name: p.name,
                      action: p.adminVerified ? 'unverify' : 'verify',
                    })
                  }
                />
                {confirmDelete === p.name ? (
                  <span className='flex items-center gap-1.5 text-[11px]'>
                    <span className='text-red-400'>Delete all?</span>
                    <button
                      onClick={() =>
                        mutate.mutate({ name: p.name, action: 'delete' })
                      }
                      className='text-red-400 hover:text-red-300 font-medium'
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className='text-neutral-500 hover:text-neutral-300'
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <ActionBtn
                    label='Delete'
                    icon={Trash2}
                    color='red'
                    onClick={() => setConfirmDelete(p.name)}
                  />
                )}
              </div>
            </div>
          ))}
          {!packages.length && (
            <p className='text-[13px] text-neutral-500 text-center py-8'>
              No packages found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ——— Orgs Tab ———

function OrgsTab({
  confirmDelete,
  setConfirmDelete,
}: {
  confirmDelete: string | null;
  setConfirmDelete: (v: string | null) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => api.get('/admin/orgs').then(r => r.data.orgs as AdminOrg[]),
  });

  const mutate = useMutation({
    mutationFn: ({ orgId, action }: { orgId: string; action: string }) =>
      action === 'delete'
        ? api.delete(`/admin/orgs/${encodeURIComponent(orgId)}`)
        : api.patch(`/admin/orgs/${encodeURIComponent(orgId)}`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
      setConfirmDelete(null);
    },
  });

  const searchLower = search.toLowerCase();
  const orgs = (data || []).filter(
    o =>
      !search ||
      o.name.toLowerCase().includes(searchLower) ||
      o.slug.toLowerCase().includes(searchLower)
  );

  return (
    <div className='space-y-3'>
      <input
        type='text'
        placeholder='Filter by name or slug...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        className='input max-w-sm'
      />
      {isLoading ? (
        <div className='space-y-2'>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className='h-12 bg-neutral-800 rounded-lg animate-pulse'
            />
          ))}
        </div>
      ) : (
        <div className='space-y-1.5'>
          {orgs.map(o => (
            <div
              key={o.id}
              className='card px-4 py-3 flex flex-wrap items-center gap-3'
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-1.5'>
                  <span className='text-[13px] font-medium text-neutral-200 truncate'>
                    {o.name}
                  </span>
                  {o.verified && (
                    <BadgeCheck className='h-3.5 w-3.5 text-emerald-400 flex-shrink-0' />
                  )}
                </div>
                <span className='text-[11px] text-neutral-500 font-mono'>
                  {o.slug}
                </span>
              </div>
              <div className='flex items-center gap-1.5'>
                <ActionBtn
                  label={o.adminVerified ? 'Unverify' : 'Verify'}
                  icon={o.adminVerified ? XCircle : CheckCircle}
                  color={o.adminVerified ? 'neutral' : 'green'}
                  onClick={() =>
                    mutate.mutate({
                      orgId: o.id,
                      action: o.adminVerified ? 'unverify' : 'verify',
                    })
                  }
                />
                {confirmDelete === o.id ? (
                  <span className='flex items-center gap-1.5 text-[11px]'>
                    <span className='text-red-400'>Delete?</span>
                    <button
                      onClick={() =>
                        mutate.mutate({ orgId: o.id, action: 'delete' })
                      }
                      className='text-red-400 hover:text-red-300 font-medium'
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className='text-neutral-500 hover:text-neutral-300'
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <ActionBtn
                    label='Delete'
                    icon={Trash2}
                    color='red'
                    onClick={() => setConfirmDelete(o.id)}
                  />
                )}
              </div>
            </div>
          ))}
          {!orgs.length && (
            <p className='text-[13px] text-neutral-500 text-center py-8'>
              No orgs found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ——— Shared button ———

function ActionBtn({
  label,
  icon: Icon,
  color,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'red' | 'green' | 'blue' | 'neutral';
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = {
    red: 'text-red-500 hover:text-red-400 border-red-900/40 hover:border-red-700/50',
    green:
      'text-emerald-500 hover:text-emerald-400 border-emerald-900/40 hover:border-emerald-700/50',
    blue: 'text-brand-500 hover:text-brand-400 border-brand-900/40 hover:border-brand-700/50',
    neutral:
      'text-neutral-500 hover:text-neutral-300 border-neutral-700/40 hover:border-neutral-600/50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 text-[11px] border px-2 py-1 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed ${colors[color]}`}
    >
      <Icon className='w-3 h-3' />
      {label}
    </button>
  );
}
