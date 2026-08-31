"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ToolCall {
  id: number;
  name: string;
  label: string;
  input: Record<string, unknown>;
  status: "running" | "done" | "error";
  ts: number;
}

const toolLabels: Record<string, (input: Record<string, unknown>) => string> = {
  search_products: (i) => {
    const parts: string[] = [];
    if (i.category) parts.push(String(i.category));
    if (i.maxPrice) parts.push(`under $${i.maxPrice}`);
    if (i.usbC) parts.push("USB-C");
    return parts.length ? `Searching ${parts.join(", ")}` : "Browsing full catalog";
  },
  get_product_details: (i) => `Inspecting ${formatId(i.productId as string)}`,
  get_product_reviews: (i) => `Reading reviews for ${formatId(i.productId as string)}`,
  view_cart: () => "Checking cart contents",
  add_to_cart: (i) => `Adding ${formatId(i.productId as string)} to cart`,
  update_cart_quantity: (i) => `Setting quantity to ${i.quantity}`,
  remove_from_cart: (i) => `Removing ${formatId(i.productId as string)}`,
  place_order: (i) =>
    i.installmentMonths
      ? `Placing order — ${i.installmentMonths}mo installments`
      : "Placing order — single payment",
  view_orders: () => "Reviewing order history",
};

function formatId(id: string) {
  return id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AgentActivity() {
  const [agentConnected, setAgentConnected] = useState(false);
  const [toolsRegistered, setToolsRegistered] = useState(false);
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
      const { id, name, input } = (e as CustomEvent).detail;
      setAgentConnected(true);
      const labelFn = toolLabels[name];
      const label = labelFn ? labelFn(input) : name.replace(/_/g, " ");
      setCalls((prev) =>
        [{ id, name, label, input, status: "running" as const, ts: Date.now() }, ...prev].slice(0, 30),
      );
      setExpanded(true);
      clearTimeout(collapseTimer.current);
    };
    const onEnd = (e: Event) => {
      const { id, success } = (e as CustomEvent).detail;
      setCalls((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: success ? ("done" as const) : ("error" as const) } : c)),
      );
      scheduleCollapse();
    };

    window.addEventListener("webmcp:ready", onReady);
    window.addEventListener("webmcp:tool-start", onStart);
    window.addEventListener("webmcp:tool-end", onEnd);

    if ("modelContext" in document || "modelContext" in navigator)
      setToolsRegistered(true);

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
      <button
        className="agent-pill"
        onClick={() => setExpanded((p) => !p)}
        aria-label="Toggle agent activity"
      >
        <span className={`agent-dot agent-dot-${status}`} />
        <strong>AI Agent</strong>
        {running > 0 && <span className="agent-count">{running}</span>}
        {calls.length > 0 && !expanded && (
          <span className="agent-peek">{calls[0].label}</span>
        )}
      </button>

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
              <span className="agent-entry-label">{call.label}</span>
              <span className="agent-entry-tool">{call.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
