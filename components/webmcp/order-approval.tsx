"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { fetchBudget, type Budget } from "@/lib/procurement/client";
import type { OrderProposal } from "@/types/procurement";

interface PendingApproval {
  requestId: string;
  proposal: OrderProposal;
}

/**
 * Human-in-the-loop gate for agent-initiated orders.
 *
 * The agent can prepare a proposal, but it cannot place the order. This panel
 * is the only path from "pending_human_approval" to a real purchase, and it
 * renders the priced proposal the server actually produced — not a summary the
 * agent wrote — so the person approves what will genuinely be charged.
 */
export function OrderApproval() {
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);

  const respond = useCallback(
    (decision: "approve" | "reject") => {
      if (!pending || submitting) return;
      setSubmitting(decision);
      window.dispatchEvent(
        new CustomEvent("webmcp:approval-response", {
          detail: { requestId: pending.requestId, decision },
        }),
      );
    },
    [pending, submitting],
  );

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail as PendingApproval;
      setPending(detail);
      setSubmitting(null);
      setBudget(null);
      void fetchBudget()
        .then((r) => r.success && r.budget && setBudget(r.budget))
        .catch(() => {});
    };
    // Fired when the agent aborts or the request times out, so the panel does
    // not linger asking for a decision that can no longer be delivered.
    const onCancel = (e: Event) => {
      const { requestId } = (e as CustomEvent).detail as { requestId: string };
      setPending((prev) => (prev?.requestId === requestId ? null : prev));
    };
    const onResolved = (e: Event) => {
      const { requestId } = (e as CustomEvent).detail as { requestId: string };
      setPending((prev) => (prev?.requestId === requestId ? null : prev));
    };

    window.addEventListener("webmcp:approval-request", onRequest);
    window.addEventListener("webmcp:approval-cancel", onCancel);
    window.addEventListener("webmcp:approval-resolved", onResolved);
    return () => {
      window.removeEventListener("webmcp:approval-request", onRequest);
      window.removeEventListener("webmcp:approval-cancel", onCancel);
      window.removeEventListener("webmcp:approval-resolved", onResolved);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") respond("reject");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, respond]);

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
            onClick={() => respond("reject")}
            disabled={submitting !== null}
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
        </div>

        <footer className="approval-actions">
          <button
            className="approval-reject"
            onClick={() => respond("reject")}
            disabled={submitting !== null}
          >
            {submitting === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <button
            className="approval-approve"
            onClick={() => respond("approve")}
            disabled={submitting !== null}
          >
            {submitting === "approve" ? "Placing order…" : `Approve $${proposal.total.toFixed(2)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
