import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { initialPlanner } from './model';
import { VisitEditor } from './visit-editor';

function visit() {
  const record = initialPlanner('default').records.find((r) => r.id === 'curitiba');
  if (!record) throw new Error('Missing fixture');
  return record;
}

describe('visit editor', () => {
  it('saves native date input events as structured dates', () => {
    const onSave = vi.fn();
    render(<VisitEditor record={visit()} onSave={onSave} onCancel={() => {}} />);
    fireEvent.input(screen.getByLabelText('Arrival'), { target: { value: '2027-12-14' } });
    fireEvent.input(screen.getByLabelText('Departure'), { target: { value: '2027-12-18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ timing: { arrival: '2027-12-14', departure: '2027-12-18' } })
    );
  });
  it('blocks reversed dates and leaves the original visit untouched on cancel', () => {
    const record = visit();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<VisitEditor record={record} onSave={onSave} onCancel={onCancel} />);
    fireEvent.input(screen.getByLabelText('Arrival'), { target: { value: '2027-12-18' } });
    fireEvent.input(screen.getByLabelText('Departure'), { target: { value: '2027-12-14' } });
    expect(screen.getByRole('alert').textContent).toContain('Departure must be');
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(record.timing).toEqual({});
  });
});
