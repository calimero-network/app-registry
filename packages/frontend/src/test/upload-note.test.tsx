import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import UploadPage from '../pages/UploadPage';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

describe('UploadPage organization note', () => {
  const out = renderToStaticMarkup(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>
  );

  it('says uploads here are public and where private packages go', () => {
    expect(out).toContain('uploads here are public');
    expect(out).toContain('Calimero Cloud');
    expect(out).toContain('meroctl app publish --org');
  });

  it('links the publishing docs', () => {
    expect(out).toContain('href="/docs#publishing"');
  });
});
