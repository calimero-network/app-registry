import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-[40vh]'>
        <div className='animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent' />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?from=${encodeURIComponent(location.pathname + location.search)}`}
        replace
        state={{ from: location }}
      />
    );
  }

  return <>{children}</>;
}
