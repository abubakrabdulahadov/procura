"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { CommerceHeader } from "@/components/layout/commerce-header";
import { emptyCart, fetchCart, fetchOrders } from "@/lib/procurement/client";
import type { Order } from "@/types/procurement";

export function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState(emptyCart);
  const [authRequired, setAuthRequired] = useState(false);
  useEffect(() => {
    void Promise.all([fetchCart(), fetchOrders()]).then(([cartResult, orderResult]) => {
      if (cartResult.success && cartResult.cart) setCart(cartResult.cart);
      if (orderResult.success && orderResult.orders) setOrders(orderResult.orders);
      else if (orderResult.error?.code === "AUTH_REQUIRED") setAuthRequired(true);
    });
  }, []);
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
                <article key={order.id}>
                  <header>
                    <div>
                      <span>Placed {new Date(order.createdAt).toLocaleDateString()}</span>
                      <h2>{order.id}</h2>
                    </div>
                    <b>{order.status}</b>
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
