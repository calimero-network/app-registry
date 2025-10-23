# Calimero Design System Components

This directory contains reusable UI components designed for the Calimero ecosystem. These components follow design system principles and are ready for extraction to a standalone design system package.

## Components

### Button

A versatile button component with multiple variants, sizes, and states.

**Features:**

- Multiple variants: primary, secondary, outline, ghost, destructive
- Size options: sm, md, lg, xl
- Loading state with spinner
- Icon support (left and right)
- Full width option
- Accessibility features

**Usage:**

```tsx
import { Button } from '@/components/design-system';

<Button variant='primary' size='md' leftIcon={<Icon />}>
  Click me
</Button>;
```

### FeatureCard

A card component for displaying features with icons and descriptions.

**Features:**

- Multiple variants: default, compact, large
- Configurable icon sizes
- Clickable support
- Consistent styling with brand colors

**Usage:**

```tsx
import { FeatureCard } from '@/components/design-system';

<FeatureCard
  icon={<Shield className='w-6 h-6' />}
  title='Security'
  description='Enterprise-grade security'
  variant='default'
/>;
```

### MetricCard

A component for displaying metrics and statistics with trend indicators.

**Features:**

- Multiple variants: default, compact, large
- Trend indicators (up, down, neutral)
- Icon support
- Loading states
- Clickable support
- Subtitle support

**Usage:**

```tsx
import { MetricCard } from '@/components/design-system';

<MetricCard
  title='Total Users'
  value='1,234'
  subtitle='Active this month'
  trend={{
    value: 12.5,
    label: 'vs last month',
    direction: 'up',
  }}
/>;
```

## Design Principles

### Color System

- **Brand Colors**: Primary lime green (#A5FF11) with variations
- **Neutral Colors**: Dark backgrounds with light text for contrast
- **Semantic Colors**: Success, warning, error, info states

### Typography

- **Font Family**: Power Grotesk (primary), Inter (secondary)
- **Font Weights**: Regular, medium, semibold, bold
- **Responsive Sizing**: Scales appropriately across devices

### Spacing

- **Consistent Spacing**: 4px base unit with logical scale
- **Component Padding**: Variants for different use cases
- **Grid System**: Flexible layouts with proper gaps

### Accessibility

- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: Proper ARIA labels and roles
- **Focus Management**: Clear focus indicators
- **Color Contrast**: WCAG AA compliant

## Development Guidelines

### Component Structure

```tsx
// 1. Import dependencies
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// 2. Define props interface
export interface ComponentProps {
  // Props here
}

// 3. Component implementation
export function Component({ ...props }: ComponentProps) {
  // Implementation
}

// 4. Display name for debugging
Component.displayName = 'Component';
```

### Styling Guidelines

- Use Tailwind CSS classes
- Leverage the `cn` utility for conditional classes
- Follow the design token system
- Maintain consistent spacing and typography

### Testing

- Each component includes Storybook stories
- Comprehensive prop coverage
- Interactive examples
- Accessibility testing

## Extraction to Design System

These components are designed to be easily extracted to a standalone design system package:

1. **Remove project-specific dependencies**
2. **Add comprehensive documentation**
3. **Include Storybook stories**
4. **Add unit tests**
5. **Create build configuration**
6. **Publish to npm registry**

## Future Enhancements

- [ ] Add more component variants
- [ ] Implement theme switching
- [ ] Add animation utilities
- [ ] Create component composition patterns
- [ ] Add internationalization support
