"use client";

import { useEffect } from "react";

export function useWebMCPSync(onSync: () => void) {
  useEffect(() => {
    const handler = () => onSync();
    window.addEventListener("webmcp:sync", handler);
    return () => window.removeEventListener("webmcp:sync", handler);
  }, [onSync]);
}
