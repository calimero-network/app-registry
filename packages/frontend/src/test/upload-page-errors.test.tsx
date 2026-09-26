// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UploadPage from '@/pages/UploadPage';
import { pushBundleFile } from '@/lib/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'dev@example.com' } }),
}));
vi.mock('@/lib/api', () => ({ pushBundleFile: vi.fn() }));

afterEach(cleanup);

async function publishRejectedWith(data: object) {
  vi.mocked(pushBundleFile).mockRejectedValueOnce({ response: { data } });
  const { container } = render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>
  );
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(['mpk'], 'app.mpk')] },
  });
  const publish = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Publish',
  });
  await waitFor(() => expect(publish.disabled).toBe(false));
  fireEvent.click(publish);
}

describe('UploadPage rejection messages', () => {
  it('lists every guide problem', async () => {
    await publishRejectedWith({
      error: 'invalid_guide',
      message: 'unused when problems are listed',
      problems: [
        "metadata.guide: missing section '## Overview'",
        "metadata.guide: '## Procedures' has no '###' procedure",
      ],
    });

    expect(
      await screen.findByText(
        "This bundle's guide does not follow the registry's guide format."
      )
    ).toBeTruthy();
    expect(
      screen.getAllByRole('listitem').map(item => item.textContent)
    ).toEqual([
      "metadata.guide: missing section '## Overview'",
      "metadata.guide: '## Procedures' has no '###' procedure",
    ]);
  });

  it('falls back to the message when a guide rejection lists no problems', async () => {
    await publishRejectedWith({
      error: 'invalid_guide',
      message: 'The guide could not be read.',
    });

    expect(
      await screen.findByText('The guide could not be read.')
    ).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
