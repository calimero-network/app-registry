import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UsernameSetupModal } from './components/UsernameSetupModal';
import { useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import ExplorePage from './pages/ExplorePage';
import AppDetailPage from './pages/AppDetailPage';
import DevelopersPage from './pages/DevelopersPage';
import DeveloperDetailPage from './pages/DeveloperDetailPage';
import UploadPage from './pages/UploadPage';
import LoginPage from './pages/LoginPage';
import MyPackagesPage from './pages/MyPackagesPage';
import MyOrgsPage from './pages/MyOrgsPage';
import OrgDetailPage from './pages/OrgDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import EditPackagePage from './pages/EditPackagePage';
import DocsPage from './pages/DocsPage';
import AdminPage from './pages/AdminPage';

function App() {
  const { user, loading } = useAuth();
  const needsUsername = !loading && !!user && !user.username;

  return (
    <>
      {needsUsername && <UsernameSetupModal />}
      <Layout>
        <Routes>
          <Route path='/' element={<HomePage />} />
          <Route path='/explore' element={<ExplorePage />} />
          {/* /apps predates Explore. Kept as a redirect so older links, the
              desktop app and anything bookmarked still resolve. */}
          <Route path='/apps' element={<Navigate to='/explore' replace />} />
          <Route path='/apps/:appId' element={<AppDetailPage />} />
          <Route
            path='/apps/:appId/:version/edit'
            element={<EditPackagePage />}
          />
          <Route path='/developers' element={<DevelopersPage />} />
          <Route path='/developers/:pubkey' element={<DeveloperDetailPage />} />
          <Route path='/upload' element={<UploadPage />} />
          <Route path='/login' element={<LoginPage />} />
          <Route
            path='/my-packages'
            element={
              <ProtectedRoute>
                <MyPackagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path='/orgs'
            element={
              <ProtectedRoute>
                <MyOrgsPage />
              </ProtectedRoute>
            }
          />
          <Route path='/orgs/:orgId' element={<OrgDetailPage />} />
          <Route path='/docs' element={<DocsPage />} />
          <Route
            path='/admin'
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path='*' element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </>
  );
}

export default App;
