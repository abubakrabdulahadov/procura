"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import {
  approveOrderRequest,
  decideOrderRequest,
  fetchBudget,
  placeOrderRequest,
  type Budget,
} from "@/lib/procurement/client";
import type { OrderProposal } from "@/types/procurement";

interface PendingApproval {
  requestId: string;
  proposal: OrderProposal;
}

/**
 * Human-in-the-loop gate for agent-initiated orders.
 *
 * The agent can prepare a proposal and open this panel, but it does not wait
 * on the answer and cannot supply one. Approving here is what actually calls
 * approve + place, so the purchase is driven entirely by the person's click;
 * the agent only learns the outcome by polling the proposal's status.
 */
export function OrderApproval() {
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setPending(null);
    setBusy(null);
    setError(null);
  }, []);

  const approve = useCallback(async () => {
    if (!pending || busy) return;
    setBusy("approve");
    setError(null);
    try {
      const approved = await approveOrderRequest(pending.proposal.id);
      if (!approved.success || !approved.proposal) {
        setBusy(null);
        return setError(approved.error?.message ?? "Could not approve this order.");
      }
      const placed = await placeOrderRequest(approved.proposal.id);
      if (!placed.success) {
        setBusy(null);
        return setError(placed.error?.message ?? "Could not place this order.");
      }
      window.dispatchEvent(new CustomEvent("webmcp:sync"));
      close();
    } catch {
      setBusy(null);
      setError("Something went wrong while placing the order.");
    }
  }, [pending, busy, close]);

  const reject = useCallback(async () => {
    if (!pending || busy) return;
    setBusy("reject");
    // Recorded server-side so the agent's status check can tell a decline
    // apart from a request the user simply never answered.
    await decideOrderRequest(pending.proposal.id, "reject").catch(() => {});
    close();
  }, [pending, busy, close]);

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail as PendingApproval;
      setPending(detail);
      setBusy(null);
      setError(null);
      setBudget(null);
      void fetchBudget()
        .then((r) => r.success && r.budget && setBudget(r.budget))
        .catch(() => {});
    };
    const onDismiss = (e: Event) => {
      const { requestId } = (e as CustomEvent).detail as { requestId?: string };
      setPending((prev) => (!requestId || prev?.requestId === requestId ? null : prev));
    };

    window.addEventListener("webmcp:approval-request", onRequest);
    window.addEventListener("webmcp:approval-dismiss", onDismiss);
    return () => {
      window.removeEventListener("webmcp:approval-request", onRequest);
      window.removeEventListener("webmcp:approval-dismiss", onDismiss);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) void reject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, busy, reject]);

  // The agent may be talking to the user somewhere else entirely, so the tab
  // itself has to ask them to come back and decide.
  useEffect(() => {
    if (!pending || busy) return;
    const original = document.title;
    let alternate = false;
    const paint = () => {
      document.title =
        document.hidden && (alternate = !alternate) ? "⚠ Approve order — Procura" : original;
    };
    paint();
    const ticker = setInterval(paint, 1200);
    document.addEventListener("visibilitychange", paint);
    return () => {
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", paint);
      document.title = original;
    };
  }, [pending, busy]);

  if (!pending) return null;

  const { proposal } = pending;
  const remainingAfter = budget?.hasLimit ? budget.remaining - proposal.total : null;

  return (
    <div className="approval-overlay" role="dialog" aria-modal="true" aria-label="Approve agent order">
      <div className="approval-panel">
        <header className="approval-header">
          <span className="approval-badge">
            <ShieldCheck size={13} /> Approval required
          </span>
          <button
            className="approval-dismiss"
            onClick={() => void reject()}
            disabled={busy !== null}
            aria-label="Reject order"
          >
            <X size={16} />
          </button>
        </header>

        <div className="approval-body">
          <h2>The AI agent wants to place this order</h2>
          <p className="approval-sub">
            Review the priced order below. Nothing is charged unless you approve it.
          </p>

          <div className="approval-items">
            {proposal.cart.items.map((item) => (
              <div key={item.product.id} className="approval-item">
                <span>
                  {item.quantity} × {item.product.name}
                  <small>{item.product.brand}</small>
                </span>
                <strong>${item.lineTotal.toFixed(2)}</strong>
              </div>
            ))}
          </div>

          <dl className="approval-lines">
            <div>
              <dt>Subtotal</dt>
              <dd>${proposal.subtotal.toFixed(2)}</dd>
            </div>
            {proposal.installmentMonths ? (
              <>
                <div>
                  <dt>Payment plan</dt>
                  <dd>{proposal.installmentMonths} months</dd>
                </div>
                <div>
                  <dt>Installment fee</dt>
                  <dd>${proposal.paymentFee.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Monthly payment</dt>
                  <dd>${(proposal.total / proposal.installmentMonths).toFixed(2)}/mo</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Payment</dt>
                <dd>Single payment</dd>
              </div>
            )}
            <div>
              <dt>Delivery</dt>
              <dd>
                {proposal.deliveryMinDays}–{proposal.deliveryMaxDays} business days
              </dd>
            </div>
            {remainingAfter !== null && (
              <div>
                <dt>Budget left after</dt>
                <dd>${remainingAfter.toFixed(2)}</dd>
              </div>
            )}
          </dl>

          <div className="approval-total">
            <span>Total charged</span>
            <strong>${proposal.total.toFixed(2)}</strong>
          </div>

          {error && (
            <p className="approval-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="approval-actions">
          <button className="approval-reject" onClick={() => void reject()} disabled={busy !== null}>
            Reject
          </button>
          <button
            className="approval-approve"
            onClick={() => void approve()}
            disabled={busy !== null}
          >
            {busy === "approve" ? "Placing order…" : `Approve $${proposal.total.toFixed(2)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
