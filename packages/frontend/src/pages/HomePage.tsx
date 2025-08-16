import { Link } from 'react-router-dom';
import { Package, Shield, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
  const totalDownloads = stats?.totalDownloads || 0;
  return (
    <div className='container mx-auto px-4 py-8'>
      {/* Hero Section */}
      <div className='text-center mb-16'>
        <h1 className='text-4xl md:text-6xl font-bold text-gray-900 mb-6'>
          SSApp Registry
        </h1>
        <p className='text-xl text-gray-600 mb-8 max-w-3xl mx-auto'>
          Discover, verify, and deploy Smart Contract Applications with
          cryptographic signatures and IPFS storage.
        </p>
        <div className='flex flex-col sm:flex-row gap-4 justify-center'>
          <Link
            to='/apps'
            className='inline-flex items-center px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors'
          >
            <Package className='w-5 h-5 mr-2' />
            Browse Apps
          </Link>
          <Link
            to='/developers'
            className='inline-flex items-center px-6 py-3 bg-gray-100 text-gray-900 font-medium rounded-lg hover:bg-gray-200 transition-colors'
          >
            View Developers
          </Link>
        </div>
      </div>

      {/* Features Section */}
      <div className='grid md:grid-cols-3 gap-8 mb-16'>
        <div className='text-center'>
          <div className='inline-flex items-center justify-center w-12 h-12 bg-primary-100 text-primary-600 rounded-lg mb-4'>
            <Shield className='w-6 h-6' />
          </div>
          <h3 className='text-lg font-semibold text-gray-900 mb-2'>
            Cryptographic Security
          </h3>
          <p className='text-gray-600'>
            All apps are cryptographically signed with Ed25519 signatures and
            verified using JCS canonicalization.
          </p>
        </div>
        <div className='text-center'>
          <div className='inline-flex items-center justify-center w-12 h-12 bg-green-100 text-green-600 rounded-lg mb-4'>
            <Package className='w-6 h-6' />
          </div>
          <h3 className='text-lg font-semibold text-gray-900 mb-2'>
            Immutable Versions
          </h3>
          <p className='text-gray-600'>
            Semantic versioning with immutable artifacts ensures reproducible
            builds and secure deployments.
          </p>
        </div>
        <div className='text-center'>
          <div className='inline-flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-600 rounded-lg mb-4'>
            <Zap className='w-6 h-6' />
          </div>
          <h3 className='text-lg font-semibold text-gray-900 mb-2'>
            IPFS Storage
          </h3>
          <p className='text-gray-600'>
            WASM artifacts are stored on IPFS with content-addressed storage for
            decentralized distribution.
          </p>
        </div>
      </div>

      {/* Stats Section */}
      <div className='bg-gray-50 rounded-lg p-8'>
        <h2 className='text-2xl font-bold text-gray-900 text-center mb-8'>
          Registry Statistics
        </h2>
        <div className='grid md:grid-cols-3 gap-8 text-center'>
          <div>
            <div className='text-3xl font-bold text-primary-600 mb-2'>
              {statsLoading ? '...' : publishedApps}
            </div>
            <div className='text-gray-600'>Published Apps</div>
          </div>
          <div>
            <div className='text-3xl font-bold text-primary-600 mb-2'>
              {statsLoading ? '...' : activeDevelopers}
            </div>
            <div className='text-gray-600'>Active Developers</div>
          </div>
          <div>
            <div className='text-3xl font-bold text-primary-600 mb-2'>
              {statsLoading ? '...' : totalDownloads}
            </div>
            <div className='text-gray-600'>Total Downloads</div>
          </div>
        </div>
      </div>
    </div>
  );
}
