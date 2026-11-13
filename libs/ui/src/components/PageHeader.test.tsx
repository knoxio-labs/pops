import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader, type BreadcrumbSegment } from './PageHeader';

describe('PageHeader title typography', () => {
  it('retains breadcrumb routing and a current page with custom heading typography', () => {
    const breadcrumbs: BreadcrumbSegment[] = [
      { label: 'Trips', href: '/trips' },
      { label: 'Coast trip' },
    ];
    render(
      <PageHeader
        title="Coast trip"
        titleClassName="font-trip-display text-3xl"
        breadcrumbs={breadcrumbs}
      />
    );
    expect(screen.getByRole('link', { name: 'Trips' })).toHaveAttribute('href', '/trips');
    expect(screen.getByRole('navigation')).toHaveTextContent('Coast trip');
    expect(screen.getByRole('heading', { level: 1, name: 'Coast trip' })).toHaveClass('text-3xl');
  });

  it.each([undefined, '/trips'])(
    'applies title sizing to the actual heading with parent %s',
    (backHref) => {
      render(
        <PageHeader
          title="Coast trip"
          backHref={backHref}
          titleClassName="font-trip-display text-3xl font-semibold sm:text-4xl"
          actions={<button type="button">Documents</button>}
        />
      );
      const heading = screen.getByRole('heading', { level: 1, name: 'Coast trip' });
      expect(heading).toHaveClass('font-trip-display', 'text-3xl', 'sm:text-4xl', 'font-semibold');
      expect(heading).not.toHaveClass('md:text-3xl', 'text-2xl', 'font-bold');
      expect(heading.childElementCount).toBe(0);
      expect(screen.getByRole('button', { name: 'Documents' })).toBeVisible();
    }
  );

  it('keeps the existing default typography when no override is provided', () => {
    render(<PageHeader title="Inventory" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'text-2xl',
      'md:text-3xl',
      'font-bold',
      'tracking-tight'
    );
  });
});
