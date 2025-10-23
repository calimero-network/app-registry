import { Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ButtonLink, MetricCard } from '@/components/design-system';
import { FeatureCard } from '@/components/FeatureCard';
import { features } from '@/constants/features';

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
  const totalDownloads = stats?.totalDownloads || 0;
  return (
    <div className='container mx-auto px-4 py-8'>
      {/* Hero Section */}
      <div className='text-center mb-16'>
        <h1 className='text-4xl md:text-6xl font-bold text-brand-600 mb-6'>
          SSApp Registry
        </h1>
        <p className='text-xl text-brand-600 mb-8 max-w-3xl mx-auto'>
          Discover, verify, and deploy Smart Contract Applications with
          cryptographic signatures and IPFS storage.
        </p>
        <div className='flex flex-col sm:flex-row gap-4 justify-center'>
          <ButtonLink
            to='/apps'
            variant='primary'
            leftIcon={<Package className='w-5 h-5' />}
          >
            BROWSE APPS
          </ButtonLink>
          <ButtonLink to='/developers' variant='secondary'>
            VIEW DEVELOPERS
          </ButtonLink>
        </div>
      </div>

      {/* Features Section */}
      <div className='grid md:grid-cols-3 gap-8 mb-16'>
        {features.map(feature => (
          <FeatureCard
            key={feature.title}
            icon={<feature.icon className='w-6 h-6' />}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>

      {/* Stats Section */}
      <div className='bg-background-primary border-2 border-brand-600 rounded-lg p-8'>
        <h2 className='text-2xl font-bold text-white text-center mb-8'>
          Registry Statistics
        </h2>
        <div className='grid md:grid-cols-3 gap-8 text-center'>
          <MetricCard
            title='Published Apps'
            value={publishedApps}
            isLoading={statsLoading}
          />
          <MetricCard
            title='Active Developers'
            value={activeDevelopers}
            isLoading={statsLoading}
          />
          <MetricCard
            title='Total Downloads'
            value={totalDownloads}
            isLoading={statsLoading}
          />
        </div>
      </div>
    </div>
  );
}
