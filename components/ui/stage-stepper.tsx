import { Check, CircleDot, LockKeyhole } from 'lucide-react';

export const STAGES = [
  'Research',
  'Intelligence',
  'Review',
  'Strategy',
  'Content',
  'Campaigns',
  'Publishing',
] as const;

export type StageState = 'done' | 'active' | 'todo' | 'blocked';
export type StepperStage = { key: string; label: string; state: StageState; href?: string; detail?: string };

export function StageStepper({
  stages = STAGES.map((label, index) => ({
    key: label.toLowerCase(),
    label,
    state: (index === 0 ? 'active' : 'todo') as StageState,
  })),
  label = 'Marketing workflow progress',
  className = '',
}: {
  stages?: StepperStage[];
  label?: string;
  className?: string;
}) {
  return (
    <ol className={['ui-stage-stepper', className].filter(Boolean).join(' ')} aria-label={label}>
      {stages.map((stage) => {
        const marker = stage.state === 'done'
          ? <Check size={13} aria-hidden="true" />
          : stage.state === 'blocked'
            ? <LockKeyhole size={12} aria-hidden="true" />
            : stage.state === 'active'
              ? <CircleDot size={12} aria-hidden="true" />
              : null;
        const content = (
          <>
            <span className="ui-stage-stepper-rail" aria-hidden="true" />
            <span className="ui-stage-stepper-marker" aria-hidden="true">{marker}</span>
            <span className="ui-stage-stepper-label">{stage.label}</span>
            {stage.detail ? <span className="ui-stage-stepper-detail">{stage.detail}</span> : null}
          </>
        );
        return (
          <li
            key={stage.key}
            className={'ui-stage-stepper-item ui-stage-stepper-item--' + stage.state}
            title={stage.label + ': ' + stage.state}
            aria-current={stage.state === 'active' ? 'step' : undefined}
          >
            {stage.href ? <a href={stage.href}>{content}</a> : <div>{content}</div>}
          </li>
        );
      })}
    </ol>
  );
}
