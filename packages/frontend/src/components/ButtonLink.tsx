import { Link } from 'react-router-dom';
import { Button } from '@calimero-network/mero-ui';
import { ReactNode } from 'react';

export interface ButtonLinkProps {
  to: string;
  children: ReactNode;
  variant?:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'outline'
    | 'ghost'
    | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  rounded?: boolean;
  'data-testid'?: string;
}

/**
 * ButtonLink component - A button that navigates using React Router Link.
 * Composed using the design system Button component with Link as the underlying element.
 * All Button styling and behavior is inherited from the design system Button.
 */
export function ButtonLink({
  to,
  children,
  size,
  rounded,
  variant,
  className,
  disabled,
  leftIcon,
  rightIcon,
  fullWidth,
  'data-testid': testId,
  ...restProps
}: ButtonLinkProps) {
  return (
    <Button
      as={Link}
      {...({
        to,
        size,
        rounded,
        variant,
        className,
        disabled,
        leftIcon,
        rightIcon,
        fullWidth,
        'data-testid': testId,
        ...restProps,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)}
    >
      {children}
    </Button>
  );
}
