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
  description: string;
}

function getIntel(id: string): ProductIntel | null {
  const product = catalog.find((p) => p.id === id);
  if (!product) return null;
  const hash = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const rating = 3.5 + (hash % 15) / 10;
  const reviewCount = 20 + (hash % 180);
  return { product, rating, reviewCount, description: "" };
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

export function ComparePanel() {
  const [items, setItems] = useState<ProductIntel[]>([]);

  useEffect(() => {
    const onCompare = (e: Event) => {
      const { productIds } = (e as CustomEvent).detail as { productIds: string[] };
      if (productIds.length === 0) {
        setItems([]);
        return;
      }
      const resolved = productIds
        .map((id) => getIntel(id))
        .filter((item): item is ProductIntel => item !== null);
      setItems(resolved);
    };
    window.addEventListener("webmcp:compare", onCompare);
    return () => window.removeEventListener("webmcp:compare", onCompare);
  }, []);

  if (items.length === 0) return null;

  const relevantSpecs = specLabels.filter((spec) =>
    items.some((item) => item.product.specs[spec.key] !== undefined),
  );

  return (
    <div className="compare-overlay" onClick={() => setItems([])}>
      <div className="compare-panel" onClick={(e) => e.stopPropagation()}>
        <header className="compare-header">
          <h2>Compare Products</h2>
          <button className="compare-close" onClick={() => setItems([])} aria-label="Close comparison">
            <X size={18} />
          </button>
        </header>

        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-label-col" />
                {items.map((item) => (
                  <th key={item.product.id} className="compare-product-col">
                    <div className="compare-product-header">
                      <ProductVisual product={item.product} compact />
                      <span className="compare-brand">{item.product.brand}</span>
                      <strong>{item.product.name}</strong>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="compare-row-highlight">
                <td className="compare-label">Price</td>
                {items.map((item) => {
                  const prices = items.map((i) => i.product.price);
                  const lowest = Math.min(...prices);
                  const isLowest = item.product.price === lowest && items.length > 1;
                  return (
                    <td key={item.product.id} className={isLowest ? "compare-best" : ""}>
                      ${item.product.price.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="compare-label">Category</td>
                {items.map((item) => (
                  <td key={item.product.id}>{item.product.category}</td>
                ))}
              </tr>
              <tr>
                <td className="compare-label">Rating</td>
                {items.map((item) => {
                  const ratings = items.map((i) => i.rating);
                  const highest = Math.max(...ratings);
                  const isBest = item.rating === highest && items.length > 1;
                  return (
                    <td key={item.product.id} className={isBest ? "compare-best" : ""}>
                      {item.rating.toFixed(1)} / 5 ({item.reviewCount})
                    </td>
                  );
                })}
              </tr>
              {relevantSpecs.map((spec) => (
                <tr key={spec.key}>
                  <td className="compare-label">{spec.label}</td>
                  {items.map((item) => {
                    const val = item.product.specs[spec.key];
                    return (
                      <td key={item.product.id}>
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
