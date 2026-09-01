"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { CommerceHeader } from "@/components/layout/commerce-header";
import { ProductVisual } from "@/components/products/product-visual";
import {
  approveOrderRequest,
  emptyCart,
  fetchCart,
  fetchOrders,
  mutateCart,
  placeOrderRequest,
  prepareOrderRequest,
} from "@/lib/procurement/client";
import { useWebMCPSync } from "@/lib/webmcp/use-sync";

type InstallmentOption = 3 | 6 | 12 | 24;
const installmentOptions: { months: InstallmentOption | null; label: string; rate: number }[] = [
  { months: null, label: "Single payment", rate: 0 },
  { months: 3, label: "3 months", rate: 0 },
  { months: 6, label: "6 months", rate: 0 },
  { months: 12, label: "12 months", rate: 0.04 },
  { months: 24, label: "24 months", rate: 0.09 },
];

export function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState(emptyCart);
  const [orderCount, setOrderCount] = useState(0);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<InstallmentOption | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const knownCartIds = useRef<Set<string>>(new Set());

  const applyCart = useCallback((nextCart: typeof emptyCart) => {
    const nextIds = new Set(nextCart.items.map((item) => item.product.id));
    setSelectedIds((selected) => {
      const nextSelected = new Set([...selected].filter((productId) => nextIds.has(productId)));
      for (const productId of nextIds) {
        if (!knownCartIds.current.has(productId)) nextSelected.add(productId);
      }
      return nextSelected;
    });
    knownCartIds.current = nextIds;
    setCart(nextCart);
  }, []);

  const selectedItems = useMemo(
    () => cart.items.filter((i) => selectedIds.has(i.product.id)),
    [cart.items, selectedIds],
  );
  const selectedSubtotal = Number(selectedItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
  const selectedCount = selectedItems.reduce((s, i) => s + i.quantity, 0);

  const fee = Number(
    (
      selectedSubtotal * (installmentOptions.find((o) => o.months === selectedPlan)?.rate ?? 0)
    ).toFixed(2),
  );
  const total = Number((selectedSubtotal + fee).toFixed(2));
  const minEligible = selectedSubtotal >= 100;
  const ineligibleItems = selectedItems.filter((item) => item.lineTotal < 100);
  const eligible = minEligible && ineligibleItems.length === 0;

  const allSelected = selectedIds.size === cart.items.length;

  const toggleItem = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(cart.items.map((i) => i.product.id)));
  };

  const reload = useCallback(() => {
    void Promise.all([fetchCart(), fetchOrders()])
      .then(([cartResult, orderResult]) => {
        if (cartResult.success && cartResult.cart) applyCart(cartResult.cart);
        else if (cartResult.error?.code === "AUTH_REQUIRED") setAuthRequired(true);
        if (orderResult.success) setOrderCount(orderResult.count ?? 0);
      })
      .catch(() => setError("Could not load cart data."));
  }, [applyCart]);

  useEffect(reload, [reload]);
  useWebMCPSync(reload);

  useEffect(() => {
    (window as unknown as { __procuraPageContext?: Record<string, unknown> }).__procuraPageContext =
      {
        page: "cart",
        itemCount: cart.itemCount,
        subtotal: cart.subtotal,
        items: cart.items.map((i) => ({
          productId: i.product.id,
          name: i.product.name,
          quantity: i.quantity,
          lineTotal: i.lineTotal,
          addedBy: i.addedBy ?? "user",
        })),
      };
    return () => {
      (window as unknown as { __procuraPageContext?: null }).__procuraPageContext = null;
    };
  }, [cart]);

  const update = async (productId: string, quantity: number) => {
    const result = await mutateCart(quantity < 1 ? "remove" : "update", productId, quantity);
    if (result.success && result.cart) applyCart(result.cart);
    else setError(result.error?.message ?? "Cart update failed.");
  };

  const confirmOrder = async () => {
    if (placing || selectedItems.length === 0) return;
    setPlacing(true);
    setError(null);
    const productIds = allSelected ? undefined : selectedItems.map((i) => i.product.id);
    try {
      const prepared = await prepareOrderRequest(selectedPlan ?? undefined, productIds);
      if (!prepared.success || !prepared.proposal)
        return setError(prepared.error?.message ?? "Could not prepare order.");
      const approved = await approveOrderRequest(prepared.proposal.id);
      if (!approved.success || !approved.proposal)
        return setError(approved.error?.message ?? "Could not approve order.");
      const result = await placeOrderRequest(approved.proposal.id);
      if (!result.success) return setError(result.error?.message ?? "Could not place order.");
      if (productIds) {
        reload();
        setCheckout(false);
      } else {
        router.push("/orders");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-main">
        <CommerceHeader cartCount={cart.itemCount} orderCount={orderCount} />
        <main className="standalone-page">
          <div className="standalone-heading">
            <span>Your purchase</span>
            <h1>Shopping cart</h1>
            <p>Select items and place the order when you are ready.</p>
          </div>
          {authRequired ? (
            <section className="standalone-empty">
              <ShoppingBag aria-hidden="true" />
              <h2>Sign in to use your cart</h2>
              <p>Your cart and orders are private to your account.</p>
              <button onClick={() => router.push("/login")}>Sign in</button>
            </section>
          ) : cart.items.length === 0 ? (
            <section className="standalone-empty">
              <ShoppingBag aria-hidden="true" />
              <h2>Your cart is empty</h2>
              <p>Browse the catalog and add products to start an order.</p>
              <button onClick={() => router.push("/")}>Browse products</button>
            </section>
          ) : (
            <div className="cart-page-layout">
              <section className="cart-page-lines">
                <div className="cart-select-all">
                  <label>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    <span>Select all ({cart.items.length})</span>
                  </label>
                </div>
                {cart.items.map((item) => {
                  const isSelected = selectedIds.has(item.product.id);
                  return (
                    <article key={item.product.id} className={isSelected ? "" : "cart-item-dimmed"}>
                      <label className="cart-item-check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.product.id)}
                        />
                      </label>
                      <div className="cart-page-glyph">
                        <ProductVisual product={item.product} compact />
                      </div>
                      <div>
                        <span>{item.product.brand}</span>
                        <h2>{item.product.name}</h2>
                        <p>${item.unitPrice.toFixed(2)} per unit</p>
                        {item.addedBy === "agent" && (
                          <span className="action-source-badge agent">Added by agent</span>
                        )}
                      </div>
                      <div className="cart-page-quantity">
                        <button
                          onClick={() => update(item.product.id, item.quantity - 1)}
                          aria-label={`Decrease ${item.product.name}`}
                        >
                          <Minus />
                        </button>
                        <strong>{item.quantity}</strong>
                        <button
                          onClick={() =>
                            mutateCart("add", item.product.id, 1).then(
                              (result) => result.success && result.cart && applyCart(result.cart),
                            )
                          }
                          aria-label={`Increase ${item.product.name}`}
                        >
                          <Plus />
                        </button>
                      </div>
                      <strong className="cart-page-total">${item.lineTotal.toFixed(2)}</strong>
                      <button
                        className="cart-page-remove"
                        onClick={() => update(item.product.id, 0)}
                        aria-label={`Remove ${item.product.name}`}
                      >
                        <Trash2 />
                      </button>
                    </article>
                  );
                })}
              </section>

              {!checkout ? (
                <aside className="cart-summary">
                  <span>Order summary</span>
                  <p>
                    <span>Selected items</span>
                    <strong>
                      {selectedCount} of {cart.itemCount}
                    </strong>
                  </p>
                  <p>
                    <span>Subtotal</span>
                    <strong>${selectedSubtotal.toFixed(2)}</strong>
                  </p>
                  <div>
                    <span>Total</span>
                    <strong>${selectedSubtotal.toFixed(2)}</strong>
                  </div>
                  {error && (
                    <p className="cart-order-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setCheckout(true);
                      setError(null);
                      setSelectedPlan(null);
                    }}
                    disabled={selectedItems.length === 0}
                  >
                    {selectedItems.length === 0
                      ? "Select items to order"
                      : `Place order (${selectedItems.length} item${selectedItems.length > 1 ? "s" : ""})`}
                  </button>
                  <small>
                    {selectedItems.length < cart.items.length
                      ? "Only selected items will be ordered."
                      : "You will choose payment terms before confirming."}
                  </small>
                </aside>
              ) : (
                <aside className="cart-summary checkout-step">
                  <button
                    className="checkout-back"
                    onClick={() => {
                      setCheckout(false);
                      setError(null);
                    }}
                  >
                    <ArrowLeft /> Back to cart
                  </button>
                  <span>Payment method</span>
                  <div className="checkout-plans">
                    {installmentOptions.map((option) => {
                      const disabled = option.months !== null && !eligible;
                      const active = selectedPlan === option.months;
                      return (
                        <button
                          key={option.months ?? "single"}
                          className={`checkout-plan ${active ? "active" : ""}`}
                          disabled={disabled}
                          onClick={() => setSelectedPlan(option.months)}
                        >
                          <strong>{option.label}</strong>
                          {option.rate > 0 ? (
                            <small>{(option.rate * 100).toFixed(0)}% fee</small>
                          ) : option.months ? (
                            <small>No fee</small>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {!eligible && (
                    <div className="checkout-installment-note">
                      {!minEligible ? (
                        <small>Installments require a minimum order of $100.</small>
                      ) : (
                        <small>
                          Each item must total at least $100 for installments.{" "}
                          {ineligibleItems.map((i) => i.product.name).join(", ")}{" "}
                          {ineligibleItems.length === 1 ? "doesn't" : "don't"} qualify.
                        </small>
                      )}
                    </div>
                  )}

                  <p>
                    <span>Selected items</span>
                    <strong>{selectedCount}</strong>
                  </p>
                  <p>
                    <span>Subtotal</span>
                    <strong>${selectedSubtotal.toFixed(2)}</strong>
                  </p>
                  {fee > 0 && (
                    <p>
                      <span>Installment fee</span>
                      <strong>${fee.toFixed(2)}</strong>
                    </p>
                  )}
                  {selectedPlan && (
                    <p>
                      <span>Monthly payment</span>
                      <strong>${(total / selectedPlan).toFixed(2)}/mo</strong>
                    </p>
                  )}
                  <div>
                    <span>Total</span>
                    <strong>${total.toFixed(2)}</strong>
                  </div>
                  {error && (
                    <p className="cart-order-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button onClick={confirmOrder} disabled={placing}>
                    {placing ? "Placing order…" : "Confirm order"}
                  </button>
                  <small>
                    {selectedPlan
                      ? `${selectedPlan} monthly payments of $${(total / selectedPlan).toFixed(2)}`
                      : "Single payment — no additional fees"}
                  </small>
                </aside>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
