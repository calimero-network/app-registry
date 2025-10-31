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
    // @ts-expect-error - Button's polymorphic 'as' prop accepts Link but types need refinement
    <Button
      as={Link}
      to={to}
      size={size}
      rounded={rounded}
      variant={variant}
      className={className}
      disabled={disabled}
      leftIcon={leftIcon}
      rightIcon={rightIcon}
      fullWidth={fullWidth}
      data-testid={testId}
      {...restProps}
    >
      {children}
    </Button>
  );
}
