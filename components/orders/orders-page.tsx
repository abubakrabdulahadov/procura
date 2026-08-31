"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, X } from "lucide-react";
import { CommerceHeader } from "@/components/layout/commerce-header";
import { cancelOrderRequest, emptyCart, fetchCart, fetchOrders } from "@/lib/procurement/client";
import { useWebMCPSync } from "@/lib/webmcp/use-sync";
import type { Order } from "@/types/procurement";

export function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState(emptyCart);
  const [authRequired, setAuthRequired] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const reload = useCallback(() => {
    void Promise.all([fetchCart(), fetchOrders()])
      .then(([cartResult, orderResult]) => {
        if (cartResult.success && cartResult.cart) setCart(cartResult.cart);
        if (orderResult.success && orderResult.orders) setOrders(orderResult.orders);
        else if (orderResult.error?.code === "AUTH_REQUIRED") setAuthRequired(true);
      })
      .catch(() => {});
  }, []);

  useEffect(reload, [reload]);
  useWebMCPSync(reload);

  const cancelOrder = async (orderId: string) => {
    if (cancelling) return;
    setCancelling(orderId);
    const result = await cancelOrderRequest(orderId);
    if (result.success && result.order) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? result.order! : o)),
      );
    }
    setCancelling(null);
  };

  return (
    <div className="app-shell">
      <div className="app-main">
        <CommerceHeader cartCount={cart.itemCount} orderCount={orders.length} />
        <main className="standalone-page">
          <div className="standalone-heading">
            <span>Purchase history</span>
            <h1>Orders</h1>
            <p>View completed purchases, items, payment terms, and totals.</p>
          </div>
          {authRequired ? (
            <section className="standalone-empty">
              <PackageCheck aria-hidden="true" />
              <h2>Sign in to view orders</h2>
              <p>Your purchase history is private to your account.</p>
              <button onClick={() => router.push("/login")}>Sign in</button>
            </section>
          ) : orders.length === 0 ? (
            <section className="standalone-empty">
              <PackageCheck aria-hidden="true" />
              <h2>No orders yet</h2>
              <p>Your completed purchases will appear here.</p>
              <button onClick={() => router.push("/")}>Browse products</button>
            </section>
          ) : (
            <section className="orders-page-list">
              {orders.map((order) => (
                <article key={order.id} className={order.status === "cancelled" ? "order-cancelled" : ""}>
                  <header>
                    <div>
                      <span>Placed {new Date(order.createdAt).toLocaleDateString()}</span>
                      <h2>{order.id}</h2>
                    </div>
                    <div className="order-header-actions">
                      <b className={`order-status order-status-${order.status}`}>
                        {order.status === "placed" ? "Active" : "Cancelled"}
                      </b>
                      {order.status === "placed" && (
                        <button
                          className="order-cancel-btn"
                          onClick={() => cancelOrder(order.id)}
                          disabled={cancelling === order.id}
                          aria-label={`Cancel order ${order.id}`}
                        >
                          {cancelling === order.id ? (
                            "Cancelling…"
                          ) : (
                            <>
                              <X size={14} /> Cancel
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </header>
                  <div>
                    {order.items.map((item) => (
                      <p key={item.product.id}>
                        <span>
                          {item.quantity} × {item.product.name}
                          <small>
                            {item.product.brand} · ${item.unitPrice.toFixed(2)} each
                          </small>
                        </span>
                        <strong>${item.lineTotal.toFixed(2)}</strong>
                      </p>
                    ))}
                  </div>
                  <footer>
                    <span>
                      {order.installmentMonths
                        ? `${order.installmentMonths}-month plan`
                        : "Single payment"}
                    </span>
                    <strong>${order.total.toFixed(2)}</strong>
                  </footer>
                </article>
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
