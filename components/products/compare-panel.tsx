"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ProductVisual } from "@/components/products/product-visual";
import { products as catalog } from "@/lib/data/mock";
import type { Product } from "@/types/procurement";

interface ProductIntel {
  product: Product;
  rating: number;
  reviewCount: number;
}

function getIntel(id: string): ProductIntel | null {
  const product = catalog.find((p) => p.id === id);
  if (!product) return null;
  const hash = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const rating = 3.5 + (hash % 15) / 10;
  const reviewCount = 20 + (hash % 180);
  return { product, rating, reviewCount };
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
  const [items, setItems] = useState<ProductIntel[]>([]);
  const [recommended, setRecommended] = useState<Set<string>>(new Set());
  const [highlights, setHighlights] = useState<Highlights>({});

  useEffect(() => {
    const onCompare = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        productIds: string[];
        recommended?: string[];
        highlights?: Highlights;
      };
      if (detail.productIds.length === 0) {
        setItems([]);
        setRecommended(new Set());
        setHighlights({});
        return;
      }
      const resolved = detail.productIds
        .map((id) => getIntel(id))
        .filter((item): item is ProductIntel => item !== null);
      setItems(resolved);
      setRecommended(new Set(detail.recommended ?? []));
      setHighlights(detail.highlights ?? {});
    };
    window.addEventListener("webmcp:compare", onCompare);
    return () => window.removeEventListener("webmcp:compare", onCompare);
  }, []);

  if (items.length === 0) return null;

  const relevantSpecs = specLabels.filter((spec) =>
    items.some((item) => item.product.specs[spec.key] !== undefined),
  );

  const close = () => { setItems([]); setRecommended(new Set()); setHighlights({}); };

  const cellClass = (field: string, productId: string) => {
    if (highlights[field] === productId) return "compare-cell-best";
    if (recommended.has(productId)) return "compare-col-recommended";
    return "";
  };

  return (
    <div className="compare-overlay" onClick={close}>
      <div className="compare-panel" onClick={(e) => e.stopPropagation()}>
        <header className="compare-header">
          <h2>Compare Products</h2>
          <button className="compare-close" onClick={close} aria-label="Close comparison">
            <X size={18} />
          </button>
        </header>

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
                <td className="compare-label">Category</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("category", item.product.id)}>
                    {item.product.category}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="compare-label">Rating</td>
                {items.map((item) => (
                  <td key={item.product.id} className={cellClass("rating", item.product.id)}>
                    {item.rating.toFixed(1)} / 5 ({item.reviewCount})
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
