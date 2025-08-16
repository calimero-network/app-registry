# SSApp Registry Frontend

A modern React-based web application for the SSApp (Smart Contract Application) Registry, built with TypeScript, Vite, and Tailwind CSS. Provides an intuitive interface for browsing, searching, and managing SSApp manifests.

## 🚀 Features

- **React 18**: Latest React features with hooks and concurrent rendering
- **TypeScript**: Full type safety and better developer experience
- **Vite**: Lightning-fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **React Router**: Client-side routing with nested routes
- **React Query**: Powerful data fetching and state management
- **Lucide Icons**: Beautiful, customizable icons
- **Responsive Design**: Mobile-first responsive layout
- **Dark Mode**: Built-in dark/light theme support

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 🔧 Configuration

### Environment Variables

```bash
# API Configuration
VITE_API_URL=http://localhost:3000          # Backend API URL
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/     # IPFS gateway for artifacts

# Application Configuration
VITE_APP_NAME=SSApp Registry               # Application name
VITE_APP_VERSION=1.0.0                     # Application version

# Feature Flags
VITE_ENABLE_DARK_MODE=true                 # Enable dark mode
VITE_ENABLE_ANALYTICS=false                # Enable analytics
```

### Environment Setup

```bash
# Copy environment file
cp .env.example .env

# Edit with your configuration
nano .env
```

## 🏗️ Architecture

### Project Structure

```
packages/frontend/
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── ui/            # Base UI components
│   │   ├── layout/        # Layout components
│   │   └── forms/         # Form components
│   ├── pages/             # Page components
│   │   ├── Home.tsx       # Home page
│   │   ├── Apps.tsx       # Applications list
│   │   ├── AppDetail.tsx  # Application details
│   │   └── Developers.tsx # Developers page
│   ├── hooks/             # Custom React hooks
│   │   ├── useApi.ts      # API client hook
│   │   └── useTheme.ts    # Theme management hook
│   ├── lib/               # Utility libraries
│   │   ├── api.ts         # API client
│   │   ├── utils.ts       # Utility functions
│   │   └── types.ts       # TypeScript definitions
│   ├── styles/            # Global styles
│   │   └── globals.css    # Global CSS
│   ├── App.tsx            # Main app component
│   └── main.tsx           # Application entry point
├── public/                # Static assets
├── index.html             # HTML template
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
└── package.json           # Package configuration
```

### Core Components

#### 1. **UI Components** (`src/components/ui/`)

- **Button**: Reusable button component with variants
- **Card**: Content container with shadow and border
- **Input**: Form input with validation states
- **Modal**: Overlay dialog component
- **Table**: Data table with sorting and pagination

#### 2. **Layout Components** (`src/components/layout/`)

- **Header**: Navigation header with logo and menu
- **Sidebar**: Collapsible sidebar navigation
- **Footer**: Application footer
- **Container**: Content wrapper with max-width

#### 3. **Page Components** (`src/pages/`)

- **Home**: Landing page with featured apps
- **Apps**: Applications listing with search and filters
- **AppDetail**: Detailed view of a single application
- **Developers**: Developer profiles and management

## 🎨 UI/UX Features

### Design System

- **Color Palette**: Consistent color scheme with CSS variables
- **Typography**: Typography scale with proper hierarchy
- **Spacing**: Consistent spacing system
- **Components**: Reusable component library

### Responsive Design

- **Mobile First**: Designed for mobile devices first
- **Breakpoints**: Responsive breakpoints for all screen sizes
- **Touch Friendly**: Optimized for touch interactions
- **Accessibility**: WCAG 2.1 AA compliance

### Dark Mode

- **Theme Toggle**: Easy switching between light and dark themes
- **System Preference**: Automatic theme based on system preference
- **Persistent**: Theme preference saved in localStorage

## 📱 Pages & Routes

### Route Structure

```
/                    # Home page
/apps               # Applications listing
/apps/:id           # Application details
/developers         # Developers listing
/developers/:id     # Developer profile
/search             # Search results
/about              # About page
```

### Page Examples

#### Home Page

```tsx
import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { useApps } from '@/hooks/useApi';

export default function Home() {
  const { data: featuredApps } = useApps({ featured: true });

  return (
    <div className='container mx-auto px-4'>
      <h1 className='text-4xl font-bold mb-8'>Welcome to SSApp Registry</h1>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {featuredApps?.map(app => (
          <Card key={app.id}>
            <h3 className='text-xl font-semibold'>{app.name}</h3>
            <p className='text-gray-600'>{app.description}</p>
            <Button href={`/apps/${app.id}`}>View Details</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

#### Applications List

```tsx
import { useState } from 'react';
import { Table, SearchInput, FilterDropdown } from '@/components/ui';
import { useApps } from '@/hooks/useApi';

export default function Apps() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const { data: apps, isLoading } = useApps({ search, filter });

  return (
    <div className='container mx-auto px-4'>
      <div className='flex gap-4 mb-6'>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder='Search applications...'
        />
        <FilterDropdown
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All Apps' },
            { value: 'verified', label: 'Verified' },
            { value: 'featured', label: 'Featured' },
          ]}
        />
      </div>

      <Table
        data={apps}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'developer', label: 'Developer' },
          { key: 'version', label: 'Version' },
          { key: 'status', label: 'Status' },
        ]}
        loading={isLoading}
      />
    </div>
  );
}
```

## 🔌 API Integration

### API Client

```typescript
// src/lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const appsApi = {
  getAll: (params?: any) => api.get('/apps', { params }),
  getById: (id: string) => api.get(`/apps/${id}`),
  create: (data: any) => api.post('/apps', data),
  update: (id: string, data: any) => api.put(`/apps/${id}`, data),
  delete: (id: string) => api.delete(`/apps/${id}`),
};
```

### React Query Integration

```typescript
// src/hooks/useApi.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appsApi } from '@/lib/api';

export function useApps(params?: any) {
  return useQuery({
    queryKey: ['apps', params],
    queryFn: () => appsApi.getAll(params),
  });
}

export function useApp(id: string) {
  return useQuery({
    queryKey: ['app', id],
    queryFn: () => appsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: appsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
  });
}
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/components/Button.test.tsx
```

### Test Examples

#### Component Test

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

#### Hook Test

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApps } from '@/hooks/useApi';

const queryClient = new QueryClient();

describe('useApps', () => {
  it('fetches apps successfully', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useApps(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });
});
```

## 🎨 Styling

### Tailwind CSS Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

### CSS Variables for Theming

```css
/* src/styles/globals.css */
:root {
  --color-primary: #3b82f6;
  --color-background: #ffffff;
  --color-text: #1f2937;
}

[data-theme='dark'] {
  --color-primary: #60a5fa;
  --color-background: #1f2937;
  --color-text: #f9fafb;
}
```

## 🚀 Build & Deployment

### Development

```bash
# Start development server
pnpm dev

# Build for development
pnpm build:dev
```

### Production

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview

# Analyze bundle size
pnpm build:analyze
```

### Docker

```dockerfile
# Dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 🔧 Development

### Development Commands

```bash
# Start development server
pnpm dev

# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Check code quality
pnpm quality

# Type checking
pnpm type-check
```

### Code Quality

- **ESLint**: Code linting with React and TypeScript rules
- **Prettier**: Code formatting
- **TypeScript**: Static type checking
- **Vitest**: Unit testing framework
- **Testing Library**: Component testing utilities

## 📄 License

This package is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

See the main [CONTRIBUTING](../../CONTRIBUTING.md) guide for details on how to contribute to this package.

## 🆘 Support

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the component documentation
- **Examples**: Review the test suite for usage examples
