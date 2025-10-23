import { Link } from 'react-router-dom';
import { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  to,
  href,
  onClick,
  disabled = false,
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-bold rounded-none transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

  const variantClasses = {
    primary:
      'bg-brand-600 text-black hover:shadow-[0_0_20px_rgba(165,255,17,0.4)]',
    secondary:
      'bg-transparent border-2 border-brand-600 text-brand-600 hover:bg-brand-600 hover:text-black',
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target='_blank'
        rel='noopener noreferrer'
        className={classes}
      >
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
