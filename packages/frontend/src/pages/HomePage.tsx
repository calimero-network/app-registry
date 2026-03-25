import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  ArrowRight,
  Shield,
  Zap,
  Users,
  Layers,
  Lock,
  Globe,
} from 'lucide-react';
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
    <div className='space-y-24 py-8'>
      {/* Hero */}
      <section className='relative text-center max-w-3xl mx-auto pt-12 pb-4'>
        <div className='absolute inset-0 -z-10'>
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-brand-600/[0.04] blur-[120px]' />
          <div className='absolute top-1/3 left-1/4 w-[200px] h-[200px] rounded-full bg-brand-600/[0.03] blur-[80px] animate-float' />
        </div>

        <div className='animate-fade-in'>
          <span className='inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-brand-600 mb-6'>
            <Package className='w-3.5 h-3.5' />
            Self-Sovereign App Registry
          </span>
        </div>

        <h1 className='animate-slide-up stagger-1 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]'>
          <span className='text-neutral-100'>Discover & Deploy</span>
          <br />
          <span className='gradient-text'>Verifiable Apps</span>
        </h1>

        <p className='animate-slide-up stagger-2 mt-6 text-base sm:text-lg text-neutral-400 font-light leading-relaxed max-w-xl mx-auto'>
          Cryptographically signed, immutably versioned, decentrally stored. The
          registry for self-sovereign applications.
        </p>

        <div className='animate-slide-up stagger-3 mt-10 flex flex-col sm:flex-row gap-3 justify-center'>
          <Link to='/apps' className='btn-primary group'>
            <Package className='w-4 h-4' />
            Browse Apps
            <ArrowRight className='w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5' />
          </Link>
          <Link to='/upload' className='btn-secondary'>
            Publish Your App
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className='animate-scale-in'>
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
      </section>

      {/* Features */}
      <section>
        <div className='text-center mb-12 animate-fade-in'>
          <h2 className='section-heading mb-3'>Why Calimero Registry</h2>
          <p className='text-xl sm:text-2xl font-semibold text-neutral-100'>
            Built for{' '}
            <span className='text-gradient-brand'>trust & transparency</span>
          </p>
        </div>

        <div className='grid md:grid-cols-3 gap-5'>
          <FeatureCard
            icon={Shield}
            title='Cryptographic Security'
            description='Ed25519 signatures with JCS canonicalization verify every published bundle.'
            index={0}
          />
          <FeatureCard
            icon={Layers}
            title='Immutable Versions'
            description='Semantic versioning with immutable artifacts ensures reproducible deployments.'
            index={1}
          />
          <FeatureCard
            icon={Zap}
            title='Decentralized Storage'
            description='WASM artifacts stored with content-addressed hashing for integrity verification.'
            index={2}
          />
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className='text-center mb-12 animate-fade-in'>
          <h2 className='section-heading mb-3'>How It Works</h2>
          <p className='text-xl sm:text-2xl font-semibold text-neutral-100'>
            From code to <span className='text-gradient-brand'>deployment</span>
          </p>
        </div>

        <div className='grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto'>
          {[
            {
              step: '01',
              icon: Lock,
              title: 'Sign & Publish',
              desc: 'Cryptographically sign your WASM bundle and push it to the registry.',
            },
            {
              step: '02',
              icon: Globe,
              title: 'Verify & Store',
              desc: 'Signatures are validated and artifacts are stored with content-addressed hashing.',
            },
            {
              step: '03',
              icon: Package,
              title: 'Discover & Deploy',
              desc: 'Users browse, verify integrity, and deploy apps to their sovereign nodes.',
            },
          ].map((item, i) => (
            <div
              key={item.step}
              className={`animate-slide-up stagger-${i + 1} text-center group`}
            >
              <div className='relative inline-flex items-center justify-center w-14 h-14 rounded-xl bg-surface border border-white/[0.06] mb-4 transition-all duration-300 group-hover:border-brand-600/30 group-hover:shadow-[0_0_20px_rgba(165,255,17,0.08)]'>
                <item.icon className='w-5 h-5 text-brand-600' />
                <span className='absolute -top-2 -right-2 text-2xs font-mono font-medium text-neutral-500 bg-surface-2 border border-white/[0.06] rounded-full w-6 h-6 flex items-center justify-center'>
                  {item.step}
                </span>
              </div>
              <h3 className='text-sm font-medium text-neutral-200 mb-1.5'>
                {item.title}
              </h3>
              <p className='text-[12px] text-neutral-500 font-light leading-relaxed'>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className='text-center animate-fade-in'>
        <div className='card max-w-xl mx-auto p-8 text-center glow-border'>
          <h2 className='text-lg font-semibold text-neutral-100 mb-2'>
            Ready to explore?
          </h2>
          <p className='text-[13px] text-neutral-400 font-light mb-6'>
            Browse self-sovereign apps or publish your own to the registry.
          </p>
          <div className='flex flex-col sm:flex-row gap-3 justify-center'>
            <Link to='/apps' className='btn-primary'>
              <Package className='w-4 h-4' />
              Explore Apps
            </Link>
            <Link to='/developers' className='btn-secondary'>
              <Users className='w-4 h-4' />
              View Developers
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <div className='card px-5 py-5 text-center group animate-glow-pulse'>
      {loading ? (
        <div className='h-8 w-14 mx-auto bg-white/[0.06] rounded animate-pulse' />
      ) : (
        <p className='text-2xl font-bold text-brand-600 tabular-nums transition-transform duration-300 group-hover:scale-110'>
          {value}
        </p>
      )}
      <p className='mt-1.5 text-[11px] text-neutral-500 font-light uppercase tracking-wider'>
        {label}
      </p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  index: number;
}) {
  return (
    <div
      className={`card p-6 group glow-border animate-slide-up stagger-${index + 1}`}
    >
      <div className='inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand-600/[0.08] border border-brand-600/[0.12] mb-4 transition-all duration-300 group-hover:bg-brand-600/[0.14] group-hover:border-brand-600/25'>
        <Icon className='w-4.5 h-4.5 text-brand-600 transition-transform duration-300 group-hover:scale-110' />
      </div>
      <h3 className='text-sm font-medium text-neutral-200 mb-2'>{title}</h3>
      <p className='text-[12px] text-neutral-500 font-light leading-relaxed'>
        {description}
      </p>
    </div>
  );
}
