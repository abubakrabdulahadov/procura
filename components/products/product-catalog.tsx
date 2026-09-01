"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { CommerceHeader } from "@/components/layout/commerce-header";
import { GlassSelect } from "@/components/ui/glass-select";
import { ProductDetail } from "@/components/products/product-detail";
import { ProductVisual } from "@/components/products/product-visual";
import { emptyCart, fetchCart, fetchOrders, mutateCart } from "@/lib/procurement/client";
import { searchProducts } from "@/lib/procurement/products";
import { useWebMCPSync } from "@/lib/webmcp/use-sync";
import type { ProductCategory } from "@/types/procurement";

export function ProductCatalog() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [category, setCategory] = useState<"all" | ProductCategory>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cart, setCart] = useState(emptyCart);
  const [orderCount, setOrderCount] = useState(0);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const result = useMemo(
    () =>
      searchProducts({
        query: query || undefined,
        category: category === "all" ? undefined : category,
        maxPrice,
      }),
    [query, category, maxPrice],
  );
  const visibleProducts = useMemo(
    () => (result.success ? [...result.products].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [result],
  );

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

  useEffect(() => {
    const onHighlight = (e: Event) => {
      const { productIds } = (e as CustomEvent).detail as { productIds: string[] };
      setHighlightedIds(new Set(productIds));
      if (productIds.length > 0) {
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-product-id="${productIds[0]}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    };
    window.addEventListener("webmcp:highlight", onHighlight);
    return () => window.removeEventListener("webmcp:highlight", onHighlight);
  }, []);

  useEffect(() => {
    (window as unknown as { __procuraPageContext?: Record<string, unknown> }).__procuraPageContext =
      {
        page: "catalog",
        totalProducts: visibleProducts.length,
        filters: {
          category: category === "all" ? null : category,
          maxPrice: maxPrice ?? null,
          query: query || null,
        },
        products: visibleProducts.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          price: p.price,
        })),
      };
    return () => {
      (window as unknown as { __procuraPageContext?: null }).__procuraPageContext = null;
    };
  }, [visibleProducts, category, maxPrice, query]);

  const addItem = async (productId: string, quantity: number) => {
    const result = await mutateCart("add", productId, quantity);
    if (result.success && result.cart) {
      setCart(result.cart);
      setSelectedProductId(null);
    } else if (result.error?.code === "AUTH_REQUIRED") router.push("/login");
  };

  return (
    <div className="app-shell">
      <div className="app-main">
        <CommerceHeader cartCount={cart.itemCount} orderCount={orderCount} />

        <main className="workspace workspace-single">
          <section className="catalog" id="catalog">
            <div className="page-heading">
              <div>
                <span className="page-overline">Procurement catalog</span>
                <h1>Products</h1>
                <p>Search goods and equipment across your procurement catalog.</p>
              </div>
            </div>
            <div className="catalog-surface">
              <div className="table-toolbar">
                <label className="search-field">
                  <Search className="field-icon" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search products…"
                    aria-label="Search products"
                  />
                  {query && (
                    <button
                      className="field-clear"
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </label>
                <div className="toolbar-divider" />
                <GlassSelect
                  label="Category"
                  value={category}
                  options={[
                    { value: "all", label: "All" },
                    { value: "monitor", label: "Monitors" },
                    { value: "laptop", label: "Laptops" },
                    { value: "accessory", label: "Accessories" },
                    { value: "office", label: "Office supplies" },
                    { value: "furniture", label: "Furniture" },
                    { value: "facilities", label: "Facilities" },
                  ]}
                  onChange={setCategory}
                  count={result.success ? result.count : 0}
                />
                <GlassSelect
                  label="Price"
                  value={maxPrice ? String(maxPrice) : "any"}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "300", label: "≤ $300" },
                    { value: "400", label: "≤ $400" },
                    { value: "500", label: "≤ $500" },
                  ]}
                  onChange={(value) => setMaxPrice(value === "any" ? undefined : Number(value))}
                />
                {(query || category !== "all" || maxPrice !== undefined) && (
                  <button
                    className="clear-filters"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      setMaxPrice(undefined);
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>

              {visibleProducts.length === 0 ? (
                <div className="catalog-empty">
                  <strong>No products found</strong>
                  <span>Try a different search or reset the active filters.</span>
                  <button
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      setMaxPrice(undefined);
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="commerce-grid">
                  {visibleProducts.map((product) => (
                    <article
                      className={`commerce-card${highlightedIds.has(product.id) ? " card-recommended" : ""}`}
                      key={product.id}
                      data-product-id={product.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProductId(product.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          setSelectedProductId(product.id);
                      }}
                      aria-label={`View ${product.name} details`}
                    >
                      <div className="commerce-media">
                        <ProductVisual product={product} />
                        <span className="category-badge">{product.category}</span>
                        {highlightedIds.has(product.id) && (
                          <span className="recommended-badge">✦ AI Recommended</span>
                        )}
                      </div>
                      <div className="commerce-body">
                        <p className="commerce-brand">{product.brand}</p>
                        <h3>{product.name}</h3>
                        <div className="commerce-specs">
                          {product.specs.sizeInches && (
                            <span>{product.specs.sizeInches}&quot;</span>
                          )}
                          {product.specs.resolution && <span>{product.specs.resolution}</span>}
                          {product.specs.refreshRateHz && (
                            <span>{product.specs.refreshRateHz} Hz</span>
                          )}
                          {product.specs.ramGb && <span>{product.specs.ramGb} GB RAM</span>}
                          {product.specs.storageGb && (
                            <span>
                              {product.specs.storageGb >= 1000
                                ? `${product.specs.storageGb / 1000} TB`
                                : `${product.specs.storageGb} GB`}
                            </span>
                          )}
                          {product.specs.connection && <span>{product.specs.connection}</span>}
                          {product.specs.material && <span>{product.specs.material}</span>}
                          {product.specs.packSize && <span>Pack of {product.specs.packSize}</span>}
                          {product.specs.usbC && <span className="spec-accent">USB-C</span>}
                        </div>
                        <div className="commerce-meta">
                          <span>Unit price</span>
                          <strong>${product.price.toFixed(2)}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
      {selectedProductId && (
        <ProductDetail
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
          onAddToCart={addItem}
        />
      )}
    </div>
  );
}
