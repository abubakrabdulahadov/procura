"use client";

import { useEffect, useRef } from "react";

type EscapeEntry = {
  dismiss: () => void;
};

const escapeStack: EscapeEntry[] = [];

export function useEscapeDismiss(active: boolean, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;

    const entry: EscapeEntry = {
      dismiss: () => dismissRef.current(),
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeStack.at(-1) !== entry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      entry.dismiss();
    };

    escapeStack.push(entry);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = escapeStack.indexOf(entry);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [active]);
}
