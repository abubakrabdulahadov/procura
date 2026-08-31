"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  checkProductAvailability,
  getInstallmentOptions,
  getProduct,
  getProductReviews,
} from "@/lib/procurement/product-intelligence";
import { useEscapeDismiss } from "@/components/ui/use-escape-dismiss";
import { ProductVisual } from "@/components/products/product-visual";

export function ProductDetail({
  productId,
  onClose,
  onAddToCart,
}: {
  productId: string;
  onClose: () => void;
  onAddToCart: (productId: string, quantity: number) => void;
}) {
  const [showReviews, setShowReviews] = useState(false);
  useEscapeDismiss(true, onClose);
  const detail = getProduct(productId);
  if (!detail.success) return null;
  const product = detail.product;
  const reviews = getProductReviews(productId, 10);
  const availability = checkProductAvailability(productId, 1);
  const installments = getInstallmentOptions(productId, 1);

  return (
    <div
      className="product-detail-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="product-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
      >
        <button className="detail-close" onClick={onClose} aria-label="Close product details">
          <X aria-hidden="true" />
        </button>
        <div className="detail-hero">
          <div className={`detail-visual detail-${product.category}`}>
            <ProductVisual product={product} />
          </div>
          <div className="detail-primary">
            <p>
              {product.category} · {product.brand}
            </p>
            <h2 id="product-detail-title">{product.name}</h2>
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
              <button onClick={() => onAddToCart(product.id, 1)}>Add to cart</button>
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
      </section>
    </div>
  );
}
