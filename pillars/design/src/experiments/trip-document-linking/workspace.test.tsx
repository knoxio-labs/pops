import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DocumentWorkspace } from './workspace';

describe('document association workflows', () => {
  it.each(['inline', 'picker'] as const)(
    'links and undoes an existing original in %s',
    (layout) => {
      render(<DocumentWorkspace layout={layout} />);
      if (layout === 'picker')
        fireEvent.click(screen.getByRole('button', { name: 'Choose documents' }));
      fireEvent.click(screen.getByRole('button', { name: /Olinda hotel reservation/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Link 1 document' }));
      const linked = screen.getByRole('region', { name: 'Linked documents' });
      expect(linked).toHaveTextContent('Olinda hotel reservation');
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(linked).not.toHaveTextContent('Olinda hotel reservation');
    }
  );
  it('unlinks only this association and lets the original be selected again', () => {
    render(<DocumentWorkspace layout="inline" />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Brazil flight confirmation' }));
    expect(screen.getByRole('region', { name: 'Linked documents' })).not.toHaveTextContent(
      'Brazil flight confirmation'
    );
    expect(screen.getByRole('button', { name: /Brazil flight confirmation/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('region', { name: 'Linked documents' })).toHaveTextContent(
      'Brazil flight confirmation'
    );
  });
  it('searches filename, blocks unavailable originals, and preserves pending selection', () => {
    render(<DocumentWorkspace layout="inline" />);
    expect(screen.getByRole('button', { name: /Previous itinerary/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Olinda hotel reservation/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
      target: { value: 'station-map.png' },
    });
    const results = screen.getByRole('region', { name: 'Existing documents' });
    expect(
      within(results).getByRole('button', { name: /Curitiba station map/ })
    ).toBeInTheDocument();
    expect(
      within(results).queryByRole('button', { name: /Olinda hotel reservation/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link 1 document' })).toBeEnabled();
  });
  it('requires a valid target without exposing opaque reference identifiers', () => {
    render(<DocumentWorkspace layout="inline" scenario="missing-reference" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a trip or item');
    fireEvent.click(screen.getByRole('button', { name: /Olinda hotel reservation/ }));
    expect(screen.getByRole('button', { name: 'Link 1 document' })).toBeDisabled();
    expect(screen.queryByText('target-removed')).not.toBeInTheDocument();
  });
});
