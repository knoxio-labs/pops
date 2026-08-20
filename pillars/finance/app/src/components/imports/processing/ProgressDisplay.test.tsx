import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressDisplay } from './ProgressDisplay';

function progress(currentStep: string, processedCount = 40) {
  return {
    currentStep,
    totalTransactions: 100,
    processedCount,
    currentBatch: [],
    errors: [],
  };
}

describe('ProgressDisplay — the AI categorization phase', () => {
  it('names the phase while it is running', () => {
    render(<ProgressDisplay isProcessing progress={progress('categorizing')} parsedCount={100} />);

    expect(screen.getByText('Categorizing with AI')).toBeInTheDocument();
  });

  it('marks the earlier steps done rather than leaving matching in flight', () => {
    render(<ProgressDisplay isProcessing progress={progress('categorizing')} parsedCount={100} />);

    expect(screen.getByText('Checking for duplicates')).toBeInTheDocument();
    expect(screen.getByText('Matching entities')).toBeInTheDocument();
  });

  it('omits the phase on a run that never reaches it', () => {
    render(<ProgressDisplay isProcessing progress={progress('matching')} parsedCount={100} />);

    expect(screen.queryByText('Categorizing with AI')).not.toBeInTheDocument();
  });

  it('reports the count it was given', () => {
    render(
      <ProgressDisplay isProcessing progress={progress('categorizing', 62)} parsedCount={100} />
    );

    expect(screen.getByText('Processing 62/100 transactions...')).toBeInTheDocument();
  });
});
