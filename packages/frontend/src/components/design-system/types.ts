// Common types for design system components

export type Size = 'sm' | 'md' | 'lg' | 'xl';
export type Variant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive';
export type CardVariant = 'default' | 'compact' | 'large';
export type TrendDirection = 'up' | 'down' | 'neutral';

// Base component props that all components should extend
export interface BaseComponentProps {
  className?: string;
  'data-testid'?: string;
  children?: React.ReactNode;
}

// Icon component props
export interface IconProps extends BaseComponentProps {
  size?: Size;
  color?: string;
}

// Loading state props
export interface LoadingProps {
  isLoading?: boolean;
  loadingText?: string;
}

// Click handler props
export interface ClickableProps {
  onClick?: () => void;
  disabled?: boolean;
}
