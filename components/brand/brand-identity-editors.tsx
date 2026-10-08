'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, RefreshCw, X } from 'lucide-react';
import type { CustomBrandRule } from '@/lib/brand/identity-mapping';
import { NotDetected } from './brand-profile-primitives';

/**
 * Client-side editing for imported Brand Identity values.
 *
 * Contract:
 * - Every write goes through the existing PATCH /api/brands/:id route, so tenant
 *   isolation, RLS and RBAC are enforced server-side exactly as before. This
 *   component never talks to Supabase directly.
 * - Save is explicit; there is no optimistic update, because a failed write
 *   must not leave the workspace showing a value the database rejected.
 * - The saved value is read back from the server response and handed back
 *   to the Brand Profile workspace immediately, so the UI can update without
 *   triggering a full route refresh after every edit.
 * - The full palette / tone list is preserved on save; we only ever send
 *   complete arrays, never a partial patch that could drop human edits.
 */

export type BrandPatch = Record<string, unknown>;

/**
 * A cleared field must persist as an empty value, not as a pair of quotes that
 * later render as content. Callers pass the raw draft; this normalises it so
 * an intentional clear writes `null` (the same shape the website import
 * already uses) instead of a stale string.
 */
export function normaliseClearedText(next: string | null | undefined): string | null {
  if (next === null || next === undefined) return null;
  const trimmed = next.trim();
  return trimmed === '' ? null : trimmed;
}

export function useBrandIdentityEditor(
  brandId: string,
  onSaved?: (brand: unknown) => void,
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = useCallback(
    async (patch: BrandPatch) => {
      setSaving(true);
      setError(null);
      try {
        // PATCH (not PUT) with camelCase keys: this is the contract the existing
        // /api/brands/:id route already enforces, including its organization
        // scoping. Going through it keeps RLS/RBAC exactly where they are.
        const response = await fetch(`/api/brands/${brandId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Could not save this change.');
        }

        const body = await response.json().catch(() => null);
        if (body?.brand && onSaved) onSaved(body.brand);
        setSavedAt(Date.now());
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save this change.');
        return false;
      } finally {
        // Always released, so a failed save can never leave a stuck spinner.
        setSaving(false);
      }
    },
    [brandId, onSaved],
  );

  return { save, saving, error, savedAt };
}

/* -------------------------------------------------------------------------- */

export function EditableTags({
  label,
  values,
  placeholder,
  max,
  onSave,
  suggestions = [],
  primaryFirst = false,
}: {
  label: string;
  values: string[];
  placeholder: string;
  max?: number;
  onSave: (next: string[]) => Promise<boolean>;
  suggestions?: string[];
  primaryFirst?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const atLimit = typeof max === 'number' && values.length >= max;

  const commit = async (next: string[]) => {
    setPending(true);
    setLocalError(null);
    const ok = await onSave(next);
    setPending(false);
    if (!ok) setLocalError('Could not save. Your change was not applied.');
    return ok;
  };

  const add = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setLocalError(`"${value}" is already in ${label.toLowerCase()}.`);
      return;
    }
    if (atLimit) {
      setLocalError(`${label} supports up to ${max} values.`);
      return;
    }
    const ok = await commit([...values, value]);
    if (ok) setDraft('');
  };

  const remove = (value: string) => commit(values.filter((v) => v !== value));

  return (
    <div>
      {values.length > 0 ? (
        <div className="brand-tags">
          {values.map((value, index) => (
            <span key={value} className={index === 0 && primaryFirst ? 'brand-tag brand-tag-primary' : 'brand-tag'}>
              {index === 0 && primaryFirst ? <span style={{ opacity: 0.7, marginRight: 4 }}>Primary</span> : null}
              {value}
              <button
                type="button"
                className="brand-tag-remove"
                onClick={() => remove(value)}
                disabled={pending}
                aria-label={`Remove ${value}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="brand-not-detected">Not detected from this website</span>
      )}

      {editing ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void add(draft);
                }
              }}
              placeholder={placeholder}
              aria-label={placeholder}
              style={{ flex: '1 1 200px', minWidth: 0 }}
              disabled={pending}
            />
            <button type="button" className="brand-btn" onClick={() => void add(draft)} disabled={pending || !draft.trim()}>
              <Plus size={13} /> Add
            </button>
            <button type="button" className="brand-btn" onClick={() => { setEditing(false); setDraft(''); setLocalError(null); }} disabled={pending}>
              Done
            </button>
          </div>
          {suggestions.length > 0 && !atLimit ? (
            <div className="brand-quick-actions">
              {suggestions
                .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
                .map((s) => (
                  <button key={s} type="button" className="brand-tag-add" onClick={() => void add(s)} disabled={pending}>
                    <Plus size={11} /> {s}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      ) : (
        <button type="button" className="brand-tag-add" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>
          <Plus size={12} /> {values.length > 0 ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        </button>
      )}

      {atLimit && editing ? (
        <p className="brand-section-hint" style={{ marginTop: 6 }}>
          {label} is limited to {max} values.
        </p>
      ) : null}
      {localError ? (
        <p className="brand-section-hint" style={{ marginTop: 6, color: 'var(--status-danger)' }}>
          {localError}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function EditablePrimaryColor({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '#000000');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing && !pending) setDraft(value ?? '#000000');
  }, [value, editing, pending]);

  const commit = async () => {
    const next = draft.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(next)) {
      setError('Enter a valid 6-digit hex colour.');
      return;
    }
    setPending(true);
    setError(null);
    const ok = await onSave(next);
    setPending(false);
    if (ok) {
      setEditing(false);
      setDraft(next);
    } else {
      setError('Could not save the primary colour. Your change was not applied.');
    }
  };

  if (!editing) {
    return (
      <div>
        {value ? (
          <div className="brand-swatch" style={{ width: 'fit-content' }}>
            <span className="brand-swatch-dot" style={{ ['--swatch' as string]: value }} />
            <span style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>{value}</span>
            <span className="brand-swatch-role">primary</span>
          </div>
        ) : <span className="brand-not-detected">No primary colour saved</span>}
        <button type="button" className="brand-tag-add" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>
          <Plus size={12} /> {value ? 'Edit primary colour' : 'Set primary colour'}
        </button>
      </div>
    );
  }

  return (
    <div className="brand-edit">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : '#000000'}
          onChange={(event) => { setDraft(event.target.value); setError(null); }}
          aria-label="Primary brand colour picker"
          disabled={pending}
          style={{ width: 44, height: 38, padding: 3, cursor: pending ? 'not-allowed' : 'pointer' }}
        />
        <input
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(null); }}
          placeholder="#B0352F"
          aria-label="Primary brand colour hex"
          disabled={pending}
          style={{ flex: '0 1 170px', minWidth: 0, fontFamily: 'ui-monospace, monospace' }}
        />
      </div>
      <div className="brand-edit-actions">
        <button type="button" className="brand-btn" onClick={() => { setEditing(false); setDraft(value ?? '#000000'); setError(null); }} disabled={pending}>Cancel</button>
        <button type="button" className="brand-btn brand-btn-primary" onClick={() => void commit()} disabled={pending}><Check size={13} /> {pending ? 'Saving…' : 'Save colour'}</button>
      </div>
      {error ? <p className="brand-section-hint" style={{ color: 'var(--status-danger)' }}>{error}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function EditableBrandRules({
  rules,
  onSave,
}: {
  rules: CustomBrandRule[];
  onSave: (next: CustomBrandRule[]) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAdding(false);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setError(null);
  };

  const beginAdd = () => {
    setAdding(true);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setError(null);
  };

  const beginEdit = (rule: CustomBrandRule) => {
    setAdding(false);
    setEditingId(rule.id);
    setTitle(rule.title);
    setDescription(rule.description);
    setError(null);
  };

  const commit = async () => {
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    if (!nextTitle) {
      setError('Give this rule a short name.');
      return;
    }
    if (!nextDescription) {
      setError('Describe what the rule means for generated work.');
      return;
    }

    const nextRule: CustomBrandRule = {
      id: editingId ?? crypto.randomUUID(),
      title: nextTitle,
      description: nextDescription,
    };
    const nextRules = editingId
      ? rules.map((rule) => rule.id === editingId ? nextRule : rule)
      : [...rules, nextRule];

    setPending(true);
    setError(null);
    const ok = await onSave(nextRules);
    setPending(false);
    if (ok) reset();
    else setError('Could not save this brand rule. Your change was not applied.');
  };

  const remove = async (id: string) => {
    setPending(true);
    setError(null);
    const ok = await onSave(rules.filter((rule) => rule.id !== id));
    setPending(false);
    if (!ok) setError('Could not remove this brand rule.');
    else if (editingId === id) reset();
  };

  return (
    <div>
      {rules.length > 0 ? (
        <div style={{ display: 'grid', gap: 9 }}>
          {rules.map((rule) => (
            <div key={rule.id} className="brand-persona" style={{ padding: '12px 14px', gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div>
                <strong style={{ display: 'block', color: 'var(--text-strong)', fontSize: 13 }}>{rule.title}</strong>
                <p className="brand-persona-desc" style={{ marginTop: 4 }}>{rule.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'start' }}>
                <button type="button" className="brand-tag-add" onClick={() => beginEdit(rule)} disabled={pending}>Edit</button>
                <button type="button" className="brand-tag-remove" onClick={() => void remove(rule.id)} disabled={pending} aria-label={'Remove ' + rule.title}><X size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="brand-not-detected">No custom rules yet. Add only the constraints your team wants AI to follow.</div>
      )}

      {adding || editingId ? (
        <div className="brand-edit" style={{ marginTop: 10 }}>
          <label>
            <span className="brand-persona-fact-label">Rule name</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Claims must be evidence-backed" disabled={pending} autoFocus />
          </label>
          <label>
            <span className="brand-persona-fact-label">Rule description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe exactly how this rule should affect strategy, campaigns and content." rows={3} disabled={pending} />
          </label>
          <div className="brand-edit-actions">
            <button type="button" className="brand-btn" onClick={reset} disabled={pending}>Cancel</button>
            <button type="button" className="brand-btn brand-btn-primary" onClick={() => void commit()} disabled={pending}><Check size={13} /> {pending ? 'Saving…' : editingId ? 'Save rule' : 'Add rule'}</button>
          </div>
          {error ? <p className="brand-section-hint" style={{ color: 'var(--status-danger)' }}>{error}</p> : null}
        </div>
      ) : (
        <button type="button" className="brand-tag-add" style={{ marginTop: 10 }} onClick={beginAdd}>
          <Plus size={12} /> Add brand rule
        </button>
      )}
      {!adding && !editingId && error ? <p className="brand-section-hint" style={{ marginTop: 7, color: 'var(--status-danger)' }}>{error}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function EditablePersonas({
  personas,
  onSave,
}: {
  personas: { name: string; description?: string | null }[];
  onSave: (next: { name: string; description?: string | null }[]) => Promise<boolean>;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditingIndex(null);
    setAdding(false);
    setName('');
    setDescription('');
    setError(null);
  };

  const startAdd = () => {
    setEditingIndex(null);
    setAdding(true);
    setName('');
    setDescription('');
    setError(null);
  };

  const startEdit = (index: number) => {
    const persona = personas[index];
    if (!persona) return;
    setEditingIndex(index);
    setAdding(false);
    setName(persona.name);
    setDescription(persona.description ?? '');
    setError(null);
  };

  const commit = async () => {
    const nextName = name.trim();
    if (!nextName) {
      setError('Give the persona a name.');
      return;
    }
    const nextPersona = { name: nextName, description: description.trim() || null };
    const next = adding
      ? [...personas, nextPersona]
      : personas.map((persona, index) => index === editingIndex ? nextPersona : persona);

    setPending(true);
    setError(null);
    const ok = await onSave(next);
    setPending(false);
    if (ok) reset();
    else setError('Could not save the persona. Your change was not applied.');
  };

  const remove = async (index: number) => {
    setPending(true);
    setError(null);
    const ok = await onSave(personas.filter((_, currentIndex) => currentIndex !== index));
    setPending(false);
    if (!ok) setError('Could not remove the persona.');
  };

  return (
    <div>
      {personas.length ? (
        <div className="brand-persona-grid">
          {personas.map((persona, index) => (
            <div key={persona.name + ':' + index} className="brand-persona">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                <h4 className="brand-persona-name">{persona.name}</h4>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="brand-tag-add" onClick={() => startEdit(index)} disabled={pending}>Edit</button>
                  <button type="button" className="brand-tag-remove" onClick={() => void remove(index)} disabled={pending} aria-label={'Remove ' + persona.name}><X size={12} /></button>
                </div>
              </div>
              {persona.description ? <p className="brand-persona-desc">{persona.description}</p> : <NotDetected label="No description yet" />}
            </div>
          ))}
        </div>
      ) : <NotDetected label="No distinct personas detected from this website" />}

      {adding || editingIndex !== null ? (
        <div className="brand-edit" style={{ marginTop: 10 }}>
          <label>
            <span className="brand-persona-fact-label">Persona name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Operations leader" disabled={pending} autoFocus />
          </label>
          <label>
            <span className="brand-persona-fact-label">Persona description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What they need, care about or are trying to achieve." rows={3} disabled={pending} />
          </label>
          <div className="brand-edit-actions">
            <button type="button" className="brand-btn" onClick={reset} disabled={pending}>Cancel</button>
            <button type="button" className="brand-btn brand-btn-primary" onClick={() => void commit()} disabled={pending}><Check size={13} /> {pending ? 'Saving…' : editingIndex !== null ? 'Save persona' : 'Add persona'}</button>
          </div>
          {error ? <p className="brand-section-hint" style={{ color: 'var(--status-danger)' }}>{error}</p> : null}
        </div>
      ) : (
        <button type="button" className="brand-tag-add" style={{ marginTop: 10 }} onClick={startAdd}>
          <Plus size={12} /> Add persona
        </button>
      )}
      {!adding && editingIndex === null && error ? <p className="brand-section-hint" style={{ marginTop: 7, color: 'var(--status-danger)' }}>{error}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function EditableColorPalette({
  palette,
  onSave,
}: {
  palette: { hex: string; role: string }[];
  onSave: (next: { hex: string; role: string }[]) => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = async (next: { hex: string; role: string }[]) => {
    setPending(true);
    setError(null);
    const ok = await onSave(next);
    setPending(false);
    if (!ok) setError('Could not save the palette. Your change was not applied.');
    return ok;
  };

  const add = async () => {
    const hex = draft.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) {
      setError('Enter a 6-digit hex colour, for example #B0352F.');
      return;
    }
    if (palette.some((c) => c.hex.toLowerCase() === hex)) {
      setError('That colour is already in the palette.');
      return;
    }
    const ok = await commit([...palette, { hex, role: 'custom' }]);
    if (ok) { setDraft(''); setEditing(false); }
  };

  const remove = (hex: string) => commit(palette.filter((c) => c.hex.toLowerCase() !== hex.toLowerCase()));

  return (
    <div>
      {palette.length > 0 ? (
        <div className="brand-swatches">
          {palette.map((color) => (
            <span key={color.hex} className="brand-swatch">
              <span className="brand-swatch-dot" style={{ ['--swatch' as string]: color.hex }} />
              <span style={{ textTransform: 'uppercase' }}>{color.hex.replace('#', '')}</span>
              {color.role && color.role !== 'custom' ? <span className="brand-swatch-role">{color.role}</span> : null}
              {editing ? (
                <button
                  type="button"
                  className="brand-tag-remove"
                  onClick={() => remove(color.hex)}
                  disabled={pending}
                  aria-label={`Remove ${color.hex}`}
                >
                  <X size={11} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : (
        <span className="brand-not-detected">No colours could be detected on this website</span>
      )}

      {editing ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void add(); } }}
            placeholder="#B0352F"
            aria-label="Hex colour"
            style={{ flex: '0 1 160px', minWidth: 0, fontFamily: 'ui-monospace, monospace' }}
            disabled={pending}
          />
          <button type="button" className="brand-btn brand-btn-primary" onClick={() => void add()} disabled={pending || !draft.trim()}>
            <Check size={13} /> Add colour
          </button>
          <button type="button" className="brand-btn" onClick={() => { setEditing(false); setDraft(''); setError(null); }} disabled={pending}>
            Done
          </button>
        </div>
      ) : (
        <button type="button" className="brand-tag-add" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>
          <Plus size={12} /> {palette.length > 0 ? 'Edit palette' : 'Add a colour'}
        </button>
      )}

      {error ? <p className="brand-section-hint" style={{ marginTop: 6, color: 'var(--status-danger)' }}>{error}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function EditableTextField({
  value,
  placeholder,
  onSave,
  multiline = false,
  emptyLabel = 'Not detected from this website',
}: {
  value: string | null;
  placeholder: string;
  onSave: (next: string) => Promise<boolean>;
  multiline?: boolean;
  emptyLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Never repaint a saved draft from the prop: after save + router.refresh()
    // the server prop is authoritative, but until that refresh lands the prop
    // can still hold the pre-save value. Editing state is the user's intent and
    // must win over stale props.
    if (!editing && !pending) setDraft(value ?? '');
  }, [value, editing, pending]);

  const commit = async () => {
    setPending(true);
    setError(null);
    // A cleared draft is an intentional clear: send null so the field is
    // actually emptied on the server instead of reverting to stale data.
    const ok = await onSave(normaliseClearedText(draft) ?? '');
    setPending(false);
    if (ok) {
      setEditing(false);
      setDraft(normaliseClearedText(draft) ?? '');
    } else {
      setError('Could not save. Your change was not applied.');
    }
  };

  if (!editing) {
    return (
      <div>
        {value ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
        ) : (
          <span className="brand-not-detected">{emptyLabel}</span>
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" className="brand-tag-add" onClick={() => setEditing(true)}>
            {value ? 'Edit' : 'Add value'}
          </button>
          {value ? (
            <button type="button" className="brand-tag-add" onClick={() => { setDraft(''); setEditing(true); }}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="brand-edit">
      {multiline ? (
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} disabled={pending} rows={3} />
      ) : (
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} disabled={pending} />
      )}
      <div className="brand-edit-actions">
        <button type="button" className="brand-btn" onClick={() => { setEditing(false); setDraft(value ?? ''); setError(null); }} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="brand-btn brand-btn-primary" onClick={() => void commit()} disabled={pending}>
          {pending ? <RefreshCw size={13} className="spin" /> : <Check size={13} />} Save
        </button>
      </div>
      {error ? <p className="brand-section-hint" style={{ color: 'var(--status-danger)' }}>{error}</p> : null}
    </div>
  );
}