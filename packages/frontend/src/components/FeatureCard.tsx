import { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className='text-center'>
      <div className='inline-flex items-center justify-center w-12 h-12 bg-brand-600 text-black rounded-lg mb-4'>
        {icon}
      </div>
      <h3 className='text-lg font-semibold text-white mb-2'>{title}</h3>
      <p className='text-white/90'>{description}</p>
    </div>
  );
}
