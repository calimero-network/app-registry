import { ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  'data-testid'?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      className = '',
      disabled = false,
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      onClick,
      type = 'button',
      'data-testid': testId,
      ...props
    },
    ref
  ) => {
    const baseClasses = cn(
      'inline-flex items-center justify-center font-bold rounded-none transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
      fullWidth && 'w-full'
    );

    const variantClasses = {
      primary:
        'bg-brand-600 text-black hover:shadow-[0_0_20px_rgba(165,255,17,0.4)] hover:bg-brand-700',
      secondary:
        'bg-transparent border-2 border-brand-600 text-brand-600 hover:bg-brand-600 hover:text-black',
      outline:
        'bg-transparent border-2 border-neutral-300 text-neutral-900 hover:bg-neutral-50 hover:border-neutral-400',
      ghost:
        'bg-transparent text-neutral-900 hover:bg-neutral-100 hover:text-neutral-900',
      destructive:
        'bg-semantic-error text-white hover:bg-red-600 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]',
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
      xl: 'px-10 py-5 text-xl',
    };

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        onClick={onClick}
        data-testid={testId}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg
            className='animate-spin -ml-1 mr-2 h-4 w-4'
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
          >
            <circle
              className='opacity-25'
              cx='12'
              cy='12'
              r='10'
              stroke='currentColor'
              strokeWidth='4'
            />
            <path
              className='opacity-75'
              fill='currentColor'
              d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
            />
          </svg>
        )}
        {!loading && leftIcon && <span className='mr-2'>{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className='ml-2'>{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
