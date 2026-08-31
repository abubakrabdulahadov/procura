"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import {
  checkProductAvailability,
  getInstallmentOptions,
  getProduct,
  getProductReviews,
} from "@/lib/procurement/product-intelligence";
import { CommerceHeader } from "@/components/layout/commerce-header";
import { ProductVisual } from "@/components/products/product-visual";
import { emptyCart, fetchCart, fetchOrders, mutateCart } from "@/lib/procurement/client";
import { useWebMCPSync } from "@/lib/webmcp/use-sync";

export function ProductPage({ productId }: { productId: string }) {
  const router = useRouter();
  const [showReviews, setShowReviews] = useState(false);
  const [cart, setCart] = useState(emptyCart);
  const [orderCount, setOrderCount] = useState(0);
  const [adding, setAdding] = useState(false);

  const reloadCounts = useCallback(() => {
    void Promise.all([fetchCart(), fetchOrders()])
      .then(([cartResult, ordersResult]) => {
        if (cartResult.success && cartResult.cart) setCart(cartResult.cart);
        if (ordersResult.success) setOrderCount(ordersResult.count ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(reloadCounts, [reloadCounts]);
  useWebMCPSync(reloadCounts);

  const detail = getProduct(productId);
  if (!detail.success) {
    return (
      <div className="app-shell">
        <div className="app-main">
          <CommerceHeader cartCount={0} orderCount={0} />
          <main className="workspace workspace-single">
            <div className="product-page-content">
              <div className="product-page-not-found">
                <strong>Product not found</strong>
                <p>The product you're looking for doesn't exist in our catalog.</p>
                <button onClick={() => router.push("/")}>Back to catalog</button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const product = detail.product;
  const reviews = getProductReviews(productId, 10);
  const availability = checkProductAvailability(productId, 1);
  const installments = getInstallmentOptions(productId, 1);

  const addToCart = async () => {
    setAdding(true);
    const result = await mutateCart("add", product.id, 1);
    if (result.success && result.cart) setCart(result.cart);
    else if (result.error?.code === "AUTH_REQUIRED") router.push("/login");
    setAdding(false);
  };

  return (
    <div className="app-shell">
      <div className="app-main">
        <CommerceHeader cartCount={cart.itemCount} orderCount={orderCount} />
        <main className="workspace workspace-single">
          <div className="product-page-content">
            <button className="product-back-btn" onClick={() => router.push("/")}>
              <ArrowLeft aria-hidden="true" />
              <span>Back to catalog</span>
            </button>

            <div className="product-page-panel">
              <div className="detail-hero">
                <div className={`detail-visual detail-${product.category}`}>
                  <ProductVisual product={product} />
                </div>
                <div className="detail-primary">
                  <p>
                    {product.category} · {product.brand}
                  </p>
                  <h1 className="product-page-title">{product.name}</h1>
                  <div className="detail-rating">
                    <strong>★ {product.rating}</strong>
                    <span>{product.reviewCount} reviews</span>
                    <i /> <span>{product.purchasedCount.toLocaleString()} purchased</span>
                  </div>
                  <p className="detail-description">{product.description}</p>
                  <div className="detail-purchase">
                    <div className="detail-price">
                      <span>Unit price</span>
                      <strong>${product.price.toFixed(2)}</strong>
                    </div>
                    <button onClick={addToCart} disabled={adding}>
                      {adding ? "Adding…" : "Add to cart"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="detail-facts">
                <div>
                  <span>Availability</span>
                  <strong>
                    {availability.success
                      ? `${availability.availability.availableQuantity} in stock`
                      : "Unavailable"}
                  </strong>
                  <small>
                    {availability.success
                      ? `Delivery in ${availability.availability.deliveryLabel}`
                      : availability.error.message}
                  </small>
                </div>
                <div>
                  <span>Installments</span>
                  <strong>
                    {installments.success && installments.eligible
                      ? `${installments.plans.length} plans available`
                      : "Not available"}
                  </strong>
                  <small>
                    {installments.success && installments.plans[0]
                      ? `From $${installments.plans[0].monthlyPayment}/month`
                      : "Single payment"}
                  </small>
                </div>
                <div>
                  <span>Category</span>
                  <strong>{product.category}</strong>
                  <small>Catalog item</small>
                </div>
              </div>

              <div className="detail-sections">
                <section>
                  <div className="detail-section-title">
                    <h3>Specifications</h3>
                  </div>
                  <div className="detail-spec-grid">
                    {Object.entries(product.specs)
                      .filter(([, value]) => value !== undefined)
                      .map(([key, value]) => (
                        <div key={key}>
                          <span>{key.replace(/([A-Z])/g, " $1")}</span>
                          <strong>
                            {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                          </strong>
                        </div>
                      ))}
                  </div>
                </section>
                <section>
                  <div className="detail-section-title">
                    <h3>Installment plans</h3>
                    <span>Demo terms</span>
                  </div>
                  <div className="installment-grid">
                    {installments.success && installments.plans.length > 0 ? (
                      installments.plans.map((plan) => (
                        <div key={plan.months}>
                          <strong>{plan.months} months</strong>
                          <span>${plan.monthlyPayment}/mo</span>
                          <small>
                            ${plan.totalPayable} total · ${plan.fee} fee
                          </small>
                        </div>
                      ))
                    ) : (
                      <p className="detail-empty">Installments are not available for this item.</p>
                    )}
                  </div>
                </section>
                <section className="detail-reviews">
                  <button
                    className="detail-section-toggle"
                    onClick={() => setShowReviews((v) => !v)}
                    aria-expanded={showReviews}
                  >
                    <div>
                      <h3>Customer reviews</h3>
                      <span>{product.reviewCount} total</span>
                    </div>
                    <ChevronDown
                      className={`toggle-chevron ${showReviews ? "open" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {showReviews &&
                    reviews.success &&
                    reviews.reviews.map((review) => (
                      <article key={review.id}>
                        <div>
                          <strong>{review.title}</strong>
                          <span>{"★".repeat(review.rating)}</span>
                        </div>
                        <p>{review.body}</p>
                        <small>
                          {review.author} ·{" "}
                          {review.verifiedPurchase ? "Verified purchase" : "Customer review"}
                        </small>
                      </article>
                    ))}
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
