import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { AppsPage } from './pages/AppsPage'
import { AppDetailPage } from './pages/AppDetailPage'
import { DevelopersPage } from './pages/DevelopersPage'
import { DeveloperDetailPage } from './pages/DeveloperDetailPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/apps/:pubkey/:appName" element={<AppDetailPage />} />
        <Route path="/developers" element={<DevelopersPage />} />
        <Route path="/developers/:pubkey" element={<DeveloperDetailPage />} />
      </Routes>
    </Layout>
  )
}

export default App
