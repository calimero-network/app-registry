import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UsernameSetupModal } from './components/UsernameSetupModal';
import { useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import AppsPage from './pages/AppsPage';
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

function App() {
  const { user, loading } = useAuth();
  const needsUsername = !loading && !!user && !user.username;

  return (
    <>
      {needsUsername && <UsernameSetupModal />}
      <Layout>
        <Routes>
          <Route path='/' element={<HomePage />} />
          <Route path='/apps' element={<AppsPage />} />
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
          <Route path='*' element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </>
  );
}

export default App;
