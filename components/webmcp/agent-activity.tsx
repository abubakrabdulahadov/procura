"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ToolCall {
  id: number;
  name: string;
  title: string;
  status: "running" | "done" | "error";
  ts: number;
}

function formatName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AgentActivity() {
  const [agentConnected, setAgentConnected] = useState(false);
  const [toolsRegistered, setToolsRegistered] = useState(
    () => typeof document !== "undefined" && "modelContext" in document,
  );
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scheduleCollapse = useCallback(() => {
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 6000);
  }, []);

  useEffect(() => {
    const onReady = (e: Event) => {
      const { tools } = (e as CustomEvent).detail;
      setToolsRegistered(tools.length > 0);
    };
    const onStart = (e: Event) => {
      const { id, name, title } = (e as CustomEvent).detail;
      setAgentConnected(true);
      setCalls((prev) =>
        [
          {
            id,
            name,
            title: title || formatName(name),
            status: "running" as const,
            ts: Date.now(),
          },
          ...prev,
        ].slice(0, 30),
      );
      setExpanded(true);
      clearTimeout(collapseTimer.current);
    };
    const onEnd = (e: Event) => {
      const { id, success } = (e as CustomEvent).detail;
      setCalls((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: success ? ("done" as const) : ("error" as const) } : c,
        ),
      );
      scheduleCollapse();
    };

    window.addEventListener("webmcp:ready", onReady);
    window.addEventListener("webmcp:tool-start", onStart);
    window.addEventListener("webmcp:tool-end", onEnd);

    return () => {
      window.removeEventListener("webmcp:ready", onReady);
      window.removeEventListener("webmcp:tool-start", onStart);
      window.removeEventListener("webmcp:tool-end", onEnd);
      clearTimeout(collapseTimer.current);
    };
  }, [scheduleCollapse]);

  const running = calls.filter((c) => c.status === "running").length;
  const status = agentConnected
    ? running > 0
      ? "active"
      : "connected"
    : toolsRegistered
      ? "ready"
      : "idle";

  if (!agentConnected) return null;

  return (
    <div className={`agent-panel${expanded ? " agent-panel-expanded" : ""}`}>
      {expanded && calls.length > 0 && (
        <div className="agent-feed">
          {calls.slice(0, 12).map((call) => (
            <div key={call.id} className={`agent-entry agent-entry-${call.status}`}>
              <span className="agent-entry-icon">
                {call.status === "running" ? (
                  <span className="agent-spinner" />
                ) : call.status === "done" ? (
                  "✓"
                ) : (
                  "✗"
                )}
              </span>
              <span className="agent-entry-label">{call.title}</span>
            </div>
          ))}
        </div>
      )}

      <button
        className="agent-pill"
        onClick={() => setExpanded((p) => !p)}
        aria-label="Toggle agent activity"
      >
        <span className={`agent-dot agent-dot-${status}`} />
        <strong>AI Agent</strong>
        {running > 0 && <span className="agent-count">{running}</span>}
        {calls.length > 0 && !expanded && <span className="agent-peek">{calls[0].title}</span>}
      </button>
    </div>
  );
}
