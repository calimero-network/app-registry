import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, ArrowRight, Shield, Zap, Users } from 'lucide-react';
import { api } from '@/lib/api';

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await api.get('/stats');
      return response.data;
    },
  });

  const publishedApps = stats?.publishedApps || 0;
  const activeDevelopers = stats?.activeDevelopers || 0;

  return (
    <div className='space-y-16 py-4'>
      {/* Hero */}
      <div className='text-center max-w-2xl mx-auto'>
        <h1 className='text-3xl sm:text-4xl font-semibold text-neutral-100 tracking-tight'>
          Calimero Registry
        </h1>
        <p className='mt-3 text-[15px] text-neutral-400 font-light leading-relaxed'>
          Discover, verify, and deploy self-sovereign applications with
          cryptographic signatures and decentralized storage.
        </p>
        <div className='mt-8 flex flex-col sm:flex-row gap-3 justify-center'>
          <Link
            to='/apps'
            className='inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-neutral-950 text-[13px] font-medium px-5 py-2 rounded-md transition-all hover:shadow-[0_0_20px_rgba(165,255,17,0.15)]'
          >
            <Package className='w-4 h-4' />
            Browse Apps
            <ArrowRight className='w-3.5 h-3.5' />
          </Link>
          <Link
            to='/upload'
            className='inline-flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[13px] font-normal px-5 py-2 rounded-md border border-neutral-700 transition-all'
          >
            Publish Your App
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className='grid grid-cols-2 gap-4 max-w-md mx-auto'>
        <StatCard
          label='Published Apps'
          value={publishedApps}
          loading={statsLoading}
        />
        <StatCard
          label='Developers'
          value={activeDevelopers}
          loading={statsLoading}
        />
      </div>

      {/* Features */}
      <div className='grid md:grid-cols-3 gap-4'>
        <FeatureCard
          icon={Shield}
          title='Cryptographic Security'
          description='Ed25519 signatures with JCS canonicalization verify every published bundle.'
        />
        <FeatureCard
          icon={Package}
          title='Immutable Versions'
          description='Semantic versioning with immutable artifacts ensures reproducible deployments.'
        />
        <FeatureCard
          icon={Zap}
          title='Decentralized Storage'
          description='WASM artifacts stored with content-addressed hashing for integrity verification.'
        />
      </div>

      {/* CTA */}
      <div className='text-center'>
        <Link
          to='/developers'
          className='inline-flex items-center gap-2 text-[13px] text-neutral-400 hover:text-neutral-200 transition-colors'
        >
          <Users className='w-4 h-4' />
          View all developers
          <ArrowRight className='w-3 h-3' />
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className='card px-5 py-4 text-center'>
      {loading ? (
        <div className='h-7 w-12 mx-auto bg-neutral-800 rounded animate-pulse' />
      ) : (
        <p className='text-2xl font-semibold text-brand-600 tabular-nums'>
          {value}
        </p>
      )}
      <p className='mt-1 text-[12px] text-neutral-500 font-light'>{label}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className='card p-5 group'>
      <Icon className='w-4 h-4 text-brand-600 mb-3 transition-transform group-hover:scale-110' />
      <h3 className='text-[13px] font-medium text-neutral-200 mb-1.5'>
        {title}
      </h3>
      <p className='text-[12px] text-neutral-500 font-light leading-relaxed'>
        {description}
      </p>
    </div>
  );
}
