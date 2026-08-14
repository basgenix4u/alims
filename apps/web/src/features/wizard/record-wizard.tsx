'use client';

import {
  ABSTRACT_MAX,
  ABSTRACT_MIN,
  TITLE_MAX,
  TITLE_MIN,
  accessLevelSchema,
  createRecordSchema,
  outputTypeSchema,
  type AccessLevel,
  type CreateRecordInput,
  type OutputType,
} from '@alims/contracts';
import { useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';

const STEPS = ['identity', 'access', 'context'] as const;

const OUTPUT_TYPES = outputTypeSchema.options;
const ACCESS_LEVELS = accessLevelSchema.options;

type Draft = {
  outputType: OutputType;
  title: string;
  disciplines: string[];
  keywords: string[];
  abstract: string;
  researchYear: string;
  accessLevel: AccessLevel;
  licence: string;
  researchQuestion: string;
  methodology: string;
  datasetLinks: string;
  codeLinks: string;
  disciplineInput: string;
  keywordInput: string;
};

const emptyDraft = (): Draft => ({
  outputType: 'project',
  title: '',
  disciplines: [],
  keywords: [],
  abstract: '',
  researchYear: '',
  accessLevel: 'metadata_public',
  licence: 'CC-BY-4.0',
  researchQuestion: '',
  methodology: '',
  datasetLinks: '',
  codeLinks: '',
  disciplineInput: '',
  keywordInput: '',
});

export function RecordWizard() {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);

  const step = STEPS[stepIndex] ?? 'identity';
  const stepKey = {
    identity: 'wizard.steps.identity',
    access: 'wizard.steps.access',
    context: 'wizard.steps.context',
  } as const;

  const payload = useMemo((): CreateRecordInput => {
    const year = draft.researchYear.trim() ? Number(draft.researchYear) : undefined;
    return {
      outputType: draft.outputType,
      title: draft.title,
      abstract: draft.abstract.trim() ? draft.abstract : undefined,
      disciplines: draft.disciplines,
      keywords: draft.keywords,
      researchYear: Number.isFinite(year) ? year : undefined,
      accessLevel: draft.accessLevel,
      licence: draft.licence,
      researchQuestion: draft.researchQuestion.trim() || undefined,
      methodology: draft.methodology.trim() || undefined,
      datasetLinks: splitUrls(draft.datasetLinks),
      codeLinks: splitUrls(draft.codeLinks),
    };
  }, [draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setStatus('idle');
  };

  const validateCurrent = (): boolean => {
    const parsed = createRecordSchema.safeParse(payload);
    if (parsed.success) {
      setFieldErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !next[field]) next[field] = issue.message;
    }
    setFieldErrors(next);
    return false;
  };

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  };

  const save = async () => {
    if (!validateCurrent()) return;
    setStatus('saving');
    setStatusDetail(null);
    try {
      await api.records.create(payload);
      setStatus('saved');
      setDirty(false);
    } catch (err) {
      setStatus('error');
      setStatusDetail(err instanceof ApiError ? err.message : t('wizard.error'));
    }
  };

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <header className="space-y-2">
        <p className="text-sm font-medium text-brand">
          {t('wizard.step', { current: stepIndex + 1, total: STEPS.length })} — {t(stepKey[step])}
        </p>
        <ol className="flex gap-2" aria-label={t('wizard.title')}>
          {STEPS.map((item, index) => (
            <li
              key={item}
              aria-current={index === stepIndex ? 'step' : undefined}
              className={`h-2 flex-1 rounded ${index <= stepIndex ? 'bg-brand' : 'bg-surface-border'}`}
            >
              <span className="sr-only">{t(stepKey[item])}</span>
            </li>
          ))}
        </ol>
      </header>

      {dirty ? (
        <p
          role="status"
          className="rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          ⚠ {t('wizard.unsaved')}
        </p>
      ) : null}

      {Object.keys(fieldErrors).length > 0 ? (
        <div
          role="alert"
          className="rounded-md border-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-950"
        >
          <p className="font-semibold">✕ {t('wizard.validation')}</p>
          <ul className="mt-1 list-disc ps-5">
            {Object.entries(fieldErrors).map(([field, message]) => (
              <li key={field}>
                {field}: {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 'identity' ? (
        <div className="grid gap-4">
          <Field
            label={t('wizard.fields.outputType')}
            help={t('wizard.fields.outputTypeHelp')}
            htmlFor="outputType"
          >
            <select
              id="outputType"
              className="input"
              value={draft.outputType}
              onChange={(e) => update('outputType', e.target.value as OutputType)}
            >
              {OUTPUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('wizard.fields.title')}
            help={t('wizard.fields.titleHelp')}
            htmlFor="title"
            error={fieldErrors.title}
          >
            <input
              id="title"
              className="input"
              value={draft.title}
              minLength={TITLE_MIN}
              maxLength={TITLE_MAX}
              onChange={(e) => update('title', e.target.value)}
              required
            />
          </Field>
          <TagEditor
            id="disciplines"
            label={t('wizard.fields.disciplines')}
            help={t('wizard.fields.disciplinesHelp')}
            addLabel={t('wizard.addDiscipline')}
            values={draft.disciplines}
            draft={draft.disciplineInput}
            onDraft={(value) => update('disciplineInput', value)}
            onAdd={() => {
              if (draft.disciplineInput.trim()) {
                update('disciplines', [...draft.disciplines, draft.disciplineInput.trim()]);
                update('disciplineInput', '');
              }
            }}
            onRemove={(value) =>
              update(
                'disciplines',
                draft.disciplines.filter((item) => item !== value),
              )
            }
            error={fieldErrors.disciplines}
          />
          <TagEditor
            id="keywords"
            label={t('wizard.fields.keywords')}
            help={t('wizard.fields.keywordsHelp')}
            addLabel={t('wizard.addKeyword')}
            values={draft.keywords}
            draft={draft.keywordInput}
            onDraft={(value) => update('keywordInput', value)}
            onAdd={() => {
              if (draft.keywordInput.trim()) {
                update('keywords', [...draft.keywords, draft.keywordInput.trim()]);
                update('keywordInput', '');
              }
            }}
            onRemove={(value) =>
              update(
                'keywords',
                draft.keywords.filter((item) => item !== value),
              )
            }
            error={fieldErrors.keywords}
          />
        </div>
      ) : null}

      {step === 'access' ? (
        <div className="grid gap-4">
          <Field
            label={t('wizard.fields.abstract')}
            help={t('wizard.fields.abstractHelp')}
            htmlFor="abstract"
          >
            <textarea
              id="abstract"
              className="input min-h-32"
              value={draft.abstract}
              minLength={ABSTRACT_MIN}
              maxLength={ABSTRACT_MAX}
              onChange={(e) => update('abstract', e.target.value)}
            />
          </Field>
          <Field
            label={t('wizard.fields.researchYear')}
            help={t('wizard.fields.researchYearHelp')}
            htmlFor="year"
          >
            <input
              id="year"
              className="input"
              inputMode="numeric"
              value={draft.researchYear}
              onChange={(e) => update('researchYear', e.target.value)}
            />
          </Field>
          <Field
            label={t('wizard.fields.accessLevel')}
            help={t('wizard.fields.accessLevelHelp')}
            htmlFor="access"
          >
            <select
              id="access"
              className="input"
              value={draft.accessLevel}
              onChange={(e) => update('accessLevel', e.target.value as AccessLevel)}
            >
              {ACCESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('wizard.fields.licence')}
            help={t('wizard.fields.licenceHelp')}
            htmlFor="licence"
            error={fieldErrors.licence}
          >
            <input
              id="licence"
              className="input"
              value={draft.licence}
              onChange={(e) => update('licence', e.target.value)}
              required
            />
          </Field>
        </div>
      ) : null}

      {step === 'context' ? (
        <div className="grid gap-4">
          <Field
            label={t('wizard.fields.researchQuestion')}
            help={t('wizard.fields.researchQuestionHelp')}
            htmlFor="question"
          >
            <textarea
              id="question"
              className="input min-h-24"
              value={draft.researchQuestion}
              onChange={(e) => update('researchQuestion', e.target.value)}
            />
          </Field>
          <Field
            label={t('wizard.fields.methodology')}
            help={t('wizard.fields.methodologyHelp')}
            htmlFor="method"
          >
            <textarea
              id="method"
              className="input min-h-24"
              value={draft.methodology}
              onChange={(e) => update('methodology', e.target.value)}
            />
          </Field>
          <Field
            label={t('wizard.fields.datasetLinks')}
            help={t('wizard.fields.datasetLinksHelp')}
            htmlFor="datasets"
          >
            <textarea
              id="datasets"
              className="input min-h-20"
              value={draft.datasetLinks}
              onChange={(e) => update('datasetLinks', e.target.value)}
            />
          </Field>
          <Field
            label={t('wizard.fields.codeLinks')}
            help={t('wizard.fields.codeLinksHelp')}
            htmlFor="code"
          >
            <textarea
              id="code"
              className="input min-h-20"
              value={draft.codeLinks}
              onChange={(e) => update('codeLinks', e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={stepIndex === 0}
        >
          {t('wizard.back')}
        </button>
        {stepIndex < STEPS.length - 1 ? (
          <button type="button" className="btn-primary" onClick={goNext}>
            {t('wizard.next')}
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={status === 'saving'}>
            {status === 'saving' ? t('wizard.saving') : t('wizard.saveDraft')}
          </button>
        )}
      </div>

      {status === 'saved' ? (
        <p
          role="status"
          className="rounded-md border-2 border-green-700 bg-green-50 px-3 py-2 text-sm text-green-950"
        >
          ✓ {t('wizard.saved')}
        </p>
      ) : null}
      {status === 'error' ? (
        <p
          role="alert"
          className="rounded-md border-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-950"
        >
          ✕ {statusDetail ?? t('wizard.error')}
        </p>
      ) : null}
    </form>
  );
}

function Field({
  label,
  help,
  htmlFor,
  error,
  children,
}: {
  label: string;
  help: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  const helpId = `${htmlFor}-help`;
  const errorId = `${htmlFor}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <p id={helpId} className="text-sm text-ink-muted">
        {help}
      </p>
      <div aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}>{children}</div>
      {error ? (
        <p id={errorId} className="text-sm text-red-800">
          ✕ {error}
        </p>
      ) : null}
    </div>
  );
}

function TagEditor(props: {
  id: string;
  label: string;
  help: string;
  addLabel: string;
  values: string[];
  draft: string;
  onDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
  error?: string;
}) {
  return (
    <Field label={props.label} help={props.help} htmlFor={props.id} error={props.error}>
      <div className="flex flex-wrap gap-2">
        {props.values.map((value) => (
          <button
            key={value}
            type="button"
            className="rounded-full border border-surface-border px-3 py-1 text-sm"
            onClick={() => props.onRemove(value)}
          >
            {value} ×
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          id={props.id}
          className="input"
          value={props.draft}
          onChange={(e) => props.onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              props.onAdd();
            }
          }}
        />
        <button type="button" className="btn-secondary" onClick={props.onAdd}>
          {props.addLabel}
        </button>
      </div>
    </Field>
  );
}

function splitUrls(value: string): string[] | undefined {
  const items = value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}
