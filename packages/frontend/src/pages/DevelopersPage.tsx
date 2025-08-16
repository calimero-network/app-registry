import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, Users, ExternalLink, Globe, Shield, Package } from 'lucide-react'
import { appsApi } from '../lib/api'

export function DevelopersPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const { data: apps = [], isLoading, error } = useQuery({
    queryKey: ['apps'],
    queryFn: () => appsApi.getApps(),
  })

  // Extract unique developers from apps
  const developers = Array.from(
    new Set(apps.map(app => app.developer_pubkey))
  ).map(pubkey => {
    const developerApps = apps.filter(app => app.developer_pubkey === pubkey)
    return {
      pubkey,
      appCount: developerApps.length,
      latestApp: developerApps[0]?.name || 'Unknown',
    }
  })

  const filteredDevelopers = developers.filter((dev) =>
    dev.pubkey.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dev.latestApp.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Failed to load developers</div>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Developers</h1>
        <p className="mt-2 text-gray-600">
          Discover developers and their Smart Contract Applications
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          type="text"
          placeholder="Search developers by pubkey or app name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Developers Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      ) : filteredDevelopers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No developers found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? 'Try adjusting your search criteria.'
              : 'No developers have registered apps yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDevelopers.map((developer) => (
            <DeveloperCard key={developer.pubkey} developer={developer} />
          ))}
        </div>
      )}
    </div>
  )
}

function DeveloperCard({ developer }: { developer: { pubkey: string; appCount: number; latestApp: string } }) {
  return (
    <Link
      to={`/developers/${developer.pubkey}`}
      className="card p-6 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Developer
            </h3>
          </div>
          <p className="text-xs text-gray-400 font-mono mb-3">
            {developer.pubkey.slice(0, 16)}...
          </p>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <Package className="h-4 w-4 mr-2" />
              <span>{developer.appCount} app{developer.appCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="text-sm text-gray-600">
              Latest: {developer.latestApp}
            </div>
          </div>
        </div>
        <ExternalLink className="h-4 w-4 text-gray-400" />
      </div>
    </Link>
  )
}
