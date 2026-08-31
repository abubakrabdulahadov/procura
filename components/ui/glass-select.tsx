"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useEscapeDismiss } from "@/components/ui/use-escape-dismiss";

export interface GlassSelectOption<T extends string> {
  value: T;
  label: string;
}

export function GlassSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  count,
  compact = false,
}: {
  label?: string;
  value: T;
  options: GlassSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  count?: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
    };
  }, []);

  useEscapeDismiss(open, () => {
    setOpen(false);
    triggerRef.current?.focus();
  });

  return (
    <div
      className={`glass-select ${compact ? "compact" : ""} ${open ? "open" : ""} ${disabled ? "disabled" : ""}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="glass-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {label && <span>{label}</span>}
        <strong>{selected.label}</strong>
        {count !== undefined && <b>{count}</b>}
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="glass-select-menu" id={listboxId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
