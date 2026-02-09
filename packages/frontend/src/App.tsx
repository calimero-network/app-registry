import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import HomePage from './pages/HomePage';
import AppsPage from './pages/AppsPage';
import AppDetailPage from './pages/AppDetailPage';
import DevelopersPage from './pages/DevelopersPage';
import DeveloperDetailPage from './pages/DeveloperDetailPage';
import UploadPage from './pages/UploadPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<HomePage />} />
        <Route path='/apps' element={<AppsPage />} />
        <Route path='/apps/:appId' element={<AppDetailPage />} />
        <Route path='/developers' element={<DevelopersPage />} />
        <Route path='/developers/:pubkey' element={<DeveloperDetailPage />} />
        <Route path='/upload' element={<UploadPage />} />
        <Route path='*' element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
