"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ProductVisual } from "@/components/products/product-visual";
import {
  checkProductAvailability,
  getProduct,
} from "@/lib/procurement/product-intelligence";
import type { Product, ProductIntelligence } from "@/types/procurement";

interface CompareItem {
  product: Product & ProductIntelligence;
  deliveryLabel: string;
}

/**
 * Resolves a product through the same intelligence layer the agent's
 * get_product_details tool uses, so the comparison table and the agent
 * always report identical ratings, review counts, and delivery windows.
 */
function resolveItem(id: string): CompareItem | null {
  const detail = getProduct(id);
  if (!detail.success) return null;
  const availability = checkProductAvailability(id, 1);
  return {
    product: detail.product,
    deliveryLabel: availability.success ? availability.availability.deliveryLabel : "—",
  };
}

const specLabels: { key: keyof Product["specs"]; label: string; format?: (v: unknown) => string }[] = [
  { key: "sizeInches", label: "Display", format: (v) => `${v}"` },
  { key: "resolution", label: "Resolution" },
  { key: "refreshRateHz", label: "Refresh Rate", format: (v) => `${v} Hz` },
  { key: "ramGb", label: "RAM", format: (v) => `${v} GB` },
  { key: "storageGb", label: "Storage", format: (v) => (v as number) >= 1000 ? `${(v as number) / 1000} TB` : `${v} GB` },
  { key: "batteryHours", label: "Battery", format: (v) => `${v} hrs` },
  { key: "usbC", label: "USB-C", format: (v) => v ? "Yes" : "No" },
  { key: "connection", label: "Connection" },
  { key: "material", label: "Material" },
  { key: "packSize", label: "Pack Size", format: (v) => `${v} pcs` },
];

type Highlights = Record<string, string>;

export function ComparePanel() {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [recommended, setRecommended] = useState<Set<string>>(new Set());
  const [highlights, setHighlights] = useState<Highlights>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onCompare = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        productIds: string[];
        recommended?: string[];
        highlights?: Highlights;
        note?: string;
      };
      if (detail.productIds.length === 0) {
        setItems([]);
        setRecommended(new Set());
        setHighlights({});
        setNote(null);
        return;
      }
      const resolved = detail.productIds
        .map(resolveItem)
        .filter((item): item is CompareItem => item !== null);
      setItems(resolved);
      setRecommended(new Set(detail.recommended ?? []));
      setHighlights(detail.highlights ?? {});
      setNote(detail.note ?? null);
    };
    window.addEventListener("webmcp:compare", onCompare);
    return () => window.removeEventListener("webmcp:compare", onCompare);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  if (items.length === 0) return null;

  const relevantSpecs = specLabels.filter((spec) =>
    items.some((item) => item.product.specs[spec.key] !== undefined),
  );

  function close() {
    setItems([]);
    setRecommended(new Set());
    setHighlights({});
    setNote(null);
  }

  const cellClass = (field: string, productId: string) => {
    if (highlights[field] === productId) return "compare-cell-best";
    if (recommended.has(productId)) return "compare-col-recommended";
    return "";
  };

  return (
    <div className="compare-overlay" onClick={close} role="dialog" aria-modal="true" aria-label="Product comparison">
      <div className="compare-panel" onClick={(e) => e.stopPropagation()}>
        <header className="compare-header">
          <h2>Compare Products</h2>
          <button className="compare-close" onClick={close} aria-label="Close comparison">
            <X size={18} />
          </button>
        </header>

        {note && <p className="compare-note">{note}</p>}

        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-label-col" />
                {items.map((item) => {
                  const isRec = recommended.has(item.product.id);
                  return (
                    <th key={item.product.id} className={`compare-product-col${isRec ? " compare-col-recommended" : ""}`}>
                      <div className="compare-product-header">
                        <ProductVisual product={item.product} compact />
                        <span className="compare-brand">{item.product.brand}</span>
                        <strong>{item.product.name}</strong>
                        {isRec && <span className="compare-rec-badge">✦ Agent Pick</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="compare-row-highlight">
                <td className="compare-label">Price</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("price", item.product.id)}>
                    ${item.product.price.toFixed(2)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="compare-label">Rating</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("rating", item.product.id)}>
                    {item.product.rating.toFixed(1)} / 5
                    <small className="compare-sub">{item.product.reviewCount} reviews</small>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="compare-label">Purchased</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("purchasedCount", item.product.id)}>
                    {item.product.purchasedCount.toLocaleString()} times
                  </td>
                ))}
              </tr>
              <tr>
                <td className="compare-label">Delivery</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("delivery", item.product.id)}>
                    {item.deliveryLabel}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="compare-label">Category</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("category", item.product.id)}>
                    {item.product.category}
                  </td>
                ))}
              </tr>
              {relevantSpecs.map((spec) => (
                <tr key={spec.key}>
                  <td className="compare-label">{spec.label}</td>
                  {items.map((item) => {
                    const val = item.product.specs[spec.key];
                    return (
                      <td key={item.product.id} className={cellClass(spec.key, item.product.id)}>
                        {val !== undefined
                          ? spec.format
                            ? spec.format(val)
                            : String(val)
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
