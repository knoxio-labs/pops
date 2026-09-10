import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Progress } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { ColumnMapStep } from './ColumnMapStep';
import { FinalReviewStep } from './FinalReviewStep';
import { ProcessingStep } from './ProcessingStep';
import { RuleCreationStep } from './RuleCreationStep';
import { importStepLabel, importStepsFor } from './step-labels';
import { SummaryStep } from './SummaryStep';
import { TagReviewStep } from './TagReviewStep';
import { UploadStep } from './UploadStep';

const ReviewStep = lazy(() => import('./ReviewStep').then((m) => ({ default: m.ReviewStep })));

interface Step {
  number: number;
  component: React.ComponentType;
}

/** A step as the indicator renders it: renumbered for the run, and named. */
interface ShownStep {
  number: number;
  label: string;
}

const STEP_COMPONENTS: React.ComponentType[] = [
  UploadStep,
  ColumnMapStep,
  ProcessingStep,
  ReviewStep,
  TagReviewStep,
  RuleCreationStep,
  FinalReviewStep,
  SummaryStep,
];

const STEPS: Step[] = STEP_COMPONENTS.map((component, index) => ({
  number: index + 1,
  component,
}));

function getStepClasses(stepNumber: number, currentStep: number): { text: string; circle: string } {
  if (stepNumber === currentStep) {
    return {
      text: 'text-info font-semibold',
      circle: 'bg-info/10 border-2 border-info',
    };
  }
  if (stepNumber < currentStep) {
    return {
      text: 'text-success',
      circle: 'bg-success/10 border-2 border-success',
    };
  }
  return {
    text: 'text-muted-foreground',
    circle: 'bg-muted border-2 border-border',
  };
}

function StepIndicator({ step, currentStep }: { step: ShownStep; currentStep: number }) {
  const { text, circle } = getStepClasses(step.number, currentStep);
  return (
    <div className={`flex items-center gap-2 ${text}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${circle}`}>
        {step.number}
      </div>
      <span className="text-sm hidden sm:inline">{step.label}</span>
    </div>
  );
}

function StepContent({ currentStep }: { currentStep: number }) {
  if (currentStep === 4) {
    return (
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading review…</div>}>
        <ReviewStep />
      </Suspense>
    );
  }
  const Component = STEPS[currentStep - 1]?.component;
  return Component ? <Component /> : <div>Unknown step</div>;
}

/**
 * Import wizard orchestrator - manages the 8-step flow
 */
export function ImportWizard() {
  const { t } = useTranslation('finance');
  const currentStep = useImportStore((state) => state.currentStep);
  const draftSource = useImportStore((state) => state.draftSource);
  const visible = importStepsFor(draftSource);
  const first = visible[0] ?? 1;
  // A live draft has nothing to upload or map: the indicator shows the steps
  // it does have, numbered from one, while the store keeps its numbering.
  // The label is resolved from the step's REAL number, before the renumbering
  // below: a live draft's first shown step is Process, not Upload.
  const steps: ShownStep[] = STEPS.filter((step) => visible.includes(step.number)).map((step) => ({
    label: importStepLabel(step.number, t) ?? '',
    number: step.number - first + 1,
  }));
  const shown = currentStep - first + 1;
  const progress = ((shown - 1) / Math.max(steps.length - 1, 1)) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {steps.map((step) => (
            <StepIndicator key={step.number} step={step} currentStep={shown} />
          ))}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="bg-card rounded-lg border shadow-sm p-6">
        <StepContent currentStep={currentStep} />
      </div>
    </div>
  );
}
