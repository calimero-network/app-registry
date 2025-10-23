import { Shield, Package, Zap } from 'lucide-react';

export const features = [
  {
    icon: Shield,
    title: 'Cryptographic Security',
    description:
      'All apps are cryptographically signed with Ed25519 signatures and verified using JCS canonicalization.',
  },
  {
    icon: Package,
    title: 'Immutable Versions',
    description:
      'Semantic versioning with immutable artifacts ensures reproducible builds and secure deployments.',
  },
  {
    icon: Zap,
    title: 'IPFS Storage',
    description:
      'WASM artifacts are stored on IPFS with content-addressed storage for decentralized distribution.',
  },
];
