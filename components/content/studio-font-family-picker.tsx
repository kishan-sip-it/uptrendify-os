'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { STUDIO_FONT_FAMILIES, getStudioFontFamilyOption, type StudioFontFamilyOption } from '@/lib/studio/font-families';

type PickerOption = StudioFontFamilyOption | {
  value: '';
  label: 'Theme font';
  category: 'Sans serif';
  cssStack: 'Inter, Arial, sans-serif';
  weightSummary: 'Default Studio type';
  styleSummary: 'Normal and italic';
  source: 'System fonts';
};

const THEME_FONT: PickerOption = {
  value: '',
  label: 'Theme font',
  category: 'Sans serif',
  cssStack: 'Inter, Arial, sans-serif',
  weightSummary: 'Default Studio type',
  styleSummary: 'Normal and italic',
  source: 'System fonts',
};

export function StudioFontFamilyPicker({
  value,
  onChange,
  label = 'Font family',
  includeThemeDefault = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  includeThemeDefault?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const choices = useMemo<readonly PickerOption[]>(
    () => includeThemeDefault ? [THEME_FONT, ...STUDIO_FONT_FAMILIES] : STUDIO_FONT_FAMILIES,
    [includeThemeDefault],
  );
  const selected = value === '' && includeThemeDefault
    ? THEME_FONT
    : getStudioFontFamilyOption(value);
  const visibleChoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return choices;
    return choices.filter((font) =>
      [font.label, font.value, font.category, font.weightSummary, font.styleSummary, font.source]
        .some((entry) => entry.toLowerCase().includes(query)),
    );
  }, [choices, search]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const visibleCurrentValue = selected?.label ?? value.trim() || 'Inter';

  return (
    <div className="st-font-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="st-font-picker-trigger"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={selected?.label ?? value || 'Inter'}
        onClick={() => {
          setSearch('');
          setOpen((current) => !current);
        }}
      >
        <span className="st-font-picker-trigger-name">{visibleCurrentValue}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div className="st-font-picker-popover">
          <label className="st-font-picker-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search fonts…"
              aria-label="Search font families"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {value.trim() && !selected ? (
            <p className="st-font-picker-current-note">
              Current saved family: <strong>{value}</strong>. Choose a listed font to switch to a supported family.
            </p>
          ) : null}
          <div className="st-font-picker-options" role="listbox" aria-label={label}>
            {visibleChoices.map((font) => {
              const isSelected = font.value === selected?.value;
              return (
                <button
                  key={font.value || 'theme-default'}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`st-font-picker-option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(font.value);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className="st-font-picker-preview" style={{ fontFamily: font.cssStack }}>Ag</span>
                  <span className="st-font-picker-option-copy">
                    <strong>{font.label}</strong>
                    <small>{font.category} · {font.weightSummary}</small>
                    <small>{font.source} · {font.styleSummary}</small>
                  </span>
                  {isSelected ? <Check size={15} className="st-font-picker-check" aria-label="Selected font" /> : null}
                </button>
              );
            })}
            {visibleChoices.length === 0 ? <p className="st-font-picker-empty">No fonts match “{search.trim()}”.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
