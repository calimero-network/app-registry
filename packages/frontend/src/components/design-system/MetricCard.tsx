import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    label: string;
    direction: 'up' | 'down' | 'neutral';
  };
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'default' | 'compact' | 'large';
  className?: string;
  onClick?: () => void;
  'data-testid'?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  isLoading = false,
  loadingText = '...',
  variant = 'default',
  className = '',
  onClick,
  'data-testid': testId,
}: MetricCardProps) {
  const baseClasses = cn(
    'transition-all duration-300',
    onClick && 'cursor-pointer hover:scale-105',
    className
  );

  const variantClasses = {
    default: 'p-6',
    compact: 'p-4',
    large: 'p-8',
  };

  const valueSizeClasses = {
    default: 'text-3xl',
    compact: 'text-2xl',
    large: 'text-4xl',
  };

  const titleSizeClasses = {
    default: 'text-base',
    compact: 'text-sm',
    large: 'text-lg',
  };

  const trendColors = {
    up: 'text-semantic-success',
    down: 'text-semantic-error',
    neutral: 'text-neutral-400',
  };

  return (
    <div
      className={cn(baseClasses, variantClasses[variant])}
      onClick={onClick}
      data-testid={testId}
    >
      <div className='flex items-center justify-between mb-2'>
        <h3
          className={cn('font-medium text-white/80', titleSizeClasses[variant])}
        >
          {title}
        </h3>
        {icon && <div className='text-brand-600'>{icon}</div>}
      </div>

      <div
        className={cn(
          'font-bold text-brand-600 mb-1',
          valueSizeClasses[variant]
        )}
      >
        {isLoading ? loadingText : value}
      </div>

      {subtitle && <div className='text-sm text-white/60 mb-2'>{subtitle}</div>}

      {trend && (
        <div className='flex items-center text-sm'>
          <span className={cn('font-medium', trendColors[trend.direction])}>
            {trend.direction === 'up'
              ? '↗'
              : trend.direction === 'down'
                ? '↘'
                : '→'}{' '}
            {trend.value}%
          </span>
          <span className='text-white/60 ml-1'>{trend.label}</span>
        </div>
      )}
    </div>
  );
}
