# SSApp Registry Frontend

A modern React frontend for the SSApp Registry, built with TypeScript, Vite, and Tailwind CSS.

## Features

- **Modern React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **React Query** for data fetching and caching
- **Lucide React** for icons
- **Responsive Design** for all devices

## Quick Start

### Development

```bash
# Start development server
pnpm dev

# The app will be available at http://localhost:3000
```

### Building

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Testing

```bash
# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   └── Layout.tsx      # Main layout with navigation
├── pages/              # Page components
│   ├── HomePage.tsx    # Landing page
│   ├── AppsPage.tsx    # Apps listing
│   ├── AppDetailPage.tsx # App details
│   ├── DevelopersPage.tsx # Developers listing
│   └── DeveloperDetailPage.tsx # Developer details
├── lib/                # Utilities and API client
│   └── api.ts          # API client using axios
├── types/              # TypeScript type definitions
│   └── api.ts          # API response types
├── test/               # Test setup
│   └── setup.ts        # Vitest configuration
├── App.tsx             # Main app component
├── main.tsx            # App entry point
└── index.css           # Global styles
```

## API Integration

The frontend integrates with the SSApp Registry backend API:

- **Apps**: Browse, search, and view app details
- **Developers**: View developer profiles and their apps
- **Manifests**: Display app manifests with artifacts and permissions
- **Attestations**: Show registry attestations for app versions

## Development

### Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:8080
```

### Code Quality

```bash
# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type checking
pnpm type-check
```

## Technologies Used

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **React Query** - Data fetching and caching
- **Axios** - HTTP client
- **Lucide React** - Icon library
- **Vitest** - Testing framework

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Ensure all tests pass
4. Update documentation as needed
