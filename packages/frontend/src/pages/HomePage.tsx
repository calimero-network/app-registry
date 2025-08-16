import { Link } from 'react-router-dom'
import { Package, Shield, Zap, Users } from 'lucide-react'

export function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          SSApp Registry
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600 max-w-3xl mx-auto">
          Discover, verify, and deploy Smart Contract Applications (SSApps) with cryptographic security
          and IPFS integration. A decentralized registry for the future of blockchain applications.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link
            to="/apps"
            className="btn btn-primary px-6 py-3 text-base font-semibold"
          >
            Browse Apps
          </Link>
          <Link
            to="/developers"
            className="btn btn-secondary px-6 py-3 text-base font-semibold"
          >
            View Developers
          </Link>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary-600">
              Secure & Verified
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to trust SSApps
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Our registry provides cryptographic verification, immutable versioning, and decentralized
              storage for maximum security and transparency.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              <div className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                  <Shield className="h-5 w-5 flex-none text-primary-600" />
                  Cryptographic Verification
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">
                    Every app is signed with Ed25519 signatures and verified using JSON Canonicalization
                    Scheme (JCS) for tamper-proof authenticity.
                  </p>
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                  <Package className="h-5 w-5 flex-none text-primary-600" />
                  Immutable Versions
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">
                    Semantic versioning with immutability guarantees. Same version, same artifact -
                    globally consistent across all nodes.
                  </p>
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                  <Zap className="h-5 w-5 flex-none text-primary-600" />
                  IPFS Integration
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">
                    WASM artifacts stored on IPFS with content-addressed storage for decentralized,
                    censorship-resistant distribution.
                  </p>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:max-w-none">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-16 text-center lg:grid-cols-3">
              <div className="mx-auto flex max-w-xs flex-col gap-y-4">
                <dt className="text-base leading-7 text-gray-600">Registered Apps</dt>
                <dd className="order-first text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                  0
                </dd>
              </div>
              <div className="mx-auto flex max-w-xs flex-col gap-y-4">
                <dt className="text-base leading-7 text-gray-600">Active Developers</dt>
                <dd className="order-first text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                  0
                </dd>
              </div>
              <div className="mx-auto flex max-w-xs flex-col gap-y-4">
                <dt className="text-base leading-7 text-gray-600">Total Downloads</dt>
                <dd className="order-first text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                  0
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
