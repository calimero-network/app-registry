import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  variant?: 'default' | 'compact' | 'large';
  iconSize?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  'data-testid'?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  variant = 'default',
  iconSize = 'md',
  className = '',
  onClick,
  'data-testid': testId,
}: FeatureCardProps) {
  const baseClasses = cn(
    'text-center transition-all duration-300',
    onClick && 'cursor-pointer hover:scale-105',
    className
  );

  const variantClasses = {
    default: 'p-6',
    compact: 'p-4',
    large: 'p-8',
  };

  const iconSizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const iconContainerClasses = cn(
    'inline-flex items-center justify-center bg-brand-600 text-black rounded-lg mb-4',
    iconSizeClasses[iconSize]
  );

  const titleClasses = cn(
    'font-semibold text-white mb-2',
    variant === 'compact'
      ? 'text-base'
      : variant === 'large'
        ? 'text-xl'
        : 'text-lg'
  );

  const descriptionClasses = cn(
    'text-white/90',
    variant === 'compact'
      ? 'text-sm'
      : variant === 'large'
        ? 'text-lg'
        : 'text-base'
  );

  return (
    <div
      className={cn(baseClasses, variantClasses[variant])}
      onClick={onClick}
      data-testid={testId}
    >
      <div className={iconContainerClasses}>{icon}</div>
      <h3 className={titleClasses}>{title}</h3>
      <p className={descriptionClasses}>{description}</p>
    </div>
  );
}
