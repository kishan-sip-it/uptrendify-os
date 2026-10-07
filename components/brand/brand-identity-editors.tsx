'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, RefreshCw, X } from 'lucide-react';

/**
 * Client-side editing for imported Brand Identity values.
 *
 * Contract:
 * - Every write goes through the existing PATCH /api/brands/:id route, so tenant
 *   isolation, RLS and RBAC are enforced server-side exactly as before. This
 *   component never talks to Supabase directly.
 * - Save is explicit; there is no optimistic update, because a failed write
 *   must not leave the workspace showing a value the database rejected.
 * - The saved value is read back from the server, never from the draft or from
 *   the stale `identity` prop. The brand workspace is a Server Component, so
 *   the prop only changes when the route is re-rendered; without a refresh the
 *   old value stayed on screen and looked like the edit had reverted.
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

export function useBrandIdentityEditor(brandId: string) {
  const router = useRouter();
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

        // Re-render the Server Component so the authoritative value from the
        // database becomes the source of truth for the fields below. The card
        // already reports "Saved", so this runs without blanking the screen.
        startTransition(() => router.refresh());
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
    [brandId, router],
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