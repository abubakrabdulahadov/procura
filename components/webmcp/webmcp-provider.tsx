"use client";

import { useEffect } from "react";

interface ModelContext {
  registerTool: (tool: ToolDef) => void;
  unregisterTool: (name: string) => void;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown;
}

function getModelContext(): ModelContext | null {
  const doc = document as unknown as { modelContext?: ModelContext };
  const nav = navigator as unknown as { modelContext?: ModelContext };
  return doc.modelContext ?? nav.modelContext ?? null;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return res.json().catch(() => ({ success: false, error: "Server error" }));
}

function postJson(url: string, body: Record<string, unknown>) {
  return api(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function emit() {
  window.dispatchEvent(new CustomEvent("webmcp:sync"));
}

let callId = 0;

function emitToolStart(name: string, input: Record<string, unknown>) {
  const id = ++callId;
  window.dispatchEvent(
    new CustomEvent("webmcp:tool-start", { detail: { id, name, input } }),
  );
  return id;
}

function emitToolEnd(id: number, name: string, success: boolean) {
  window.dispatchEvent(
    new CustomEvent("webmcp:tool-end", { detail: { id, name, success } }),
  );
}

function traced(
  name: string,
  fn: (input: Record<string, unknown>) => Promise<unknown>,
): (input: Record<string, unknown>) => unknown {
  return async (input) => {
    const id = emitToolStart(name, input);
    try {
      const result = await fn(input);
      const ok =
        result && typeof result === "object" && "success" in result
          ? (result as { success: boolean }).success !== false
          : true;
      emitToolEnd(id, name, ok);
      return result;
    } catch (err) {
      emitToolEnd(id, name, false);
      throw err;
    }
  };
}

const toolDefs: ToolDef[] = [
  {
    name: "search_products",
    description:
      "Search the Procura procurement catalog. Returns products with ID, name, brand, category, price, and specs. Use filters to narrow results. Call without filters to see all 53 products across 6 categories: monitor, laptop, accessory, office, furniture, facilities.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["monitor", "laptop", "accessory", "office", "furniture", "facilities"],
          description: "Filter by product category",
        },
        maxPrice: {
          type: "number",
          description: "Maximum unit price in USD",
        },
        usbC: {
          type: "boolean",
          description: "Filter for USB-C connectivity support",
        },
      },
    },
    execute: traced("search_products", async (input) => {
      const { searchProducts } = await import("@/lib/procurement/products");
      const result = searchProducts({
        category: input.category as never,
        maxPrice: input.maxPrice as number | undefined,
        usbC: input.usbC as boolean | undefined,
      });
      if (!result.success) return result;
      return {
        success: true,
        count: result.count,
        products: result.products.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          price: p.price,
          specs: p.specs,
        })),
      };
    }),
  },
  {
    name: "get_product_details",
    description:
      "Get complete details for a single product by its ID. Returns full specs, customer rating, review count, purchase count, stock availability, delivery estimate, and installment payment plan options with fees.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID (e.g. 'dell-u2724de')" },
      },
      required: ["productId"],
    },
    execute: traced("get_product_details", async (input) => {
      const {
        getProduct,
        checkProductAvailability,
        getInstallmentOptions,
      } = await import("@/lib/procurement/product-intelligence");
      const detail = getProduct(input.productId as string);
      if (!detail.success) return detail;
      const avail = checkProductAvailability(input.productId as string, 1);
      const installments = getInstallmentOptions(input.productId as string, 1);
      return {
        success: true,
        product: {
          id: detail.product.id,
          name: detail.product.name,
          brand: detail.product.brand,
          category: detail.product.category,
          price: detail.product.price,
          specs: detail.product.specs,
          rating: detail.product.rating,
          reviewCount: detail.product.reviewCount,
          purchasedCount: detail.product.purchasedCount,
          description: detail.product.description,
          availability: avail.success
            ? {
                inStock: true,
                quantity: avail.availability.availableQuantity,
                delivery: avail.availability.deliveryLabel,
              }
            : { inStock: false },
          installments: installments.success
            ? { eligible: installments.eligible, plans: installments.plans }
            : { eligible: false, plans: [] },
        },
      };
    }),
  },
  {
    name: "get_product_reviews",
    description:
      "Get customer reviews for a product. Returns star ratings (1-5), review title, body text, author name, and whether it is a verified purchase.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
        limit: { type: "number", description: "Number of reviews to return (1-10, default 5)" },
      },
      required: ["productId"],
    },
    execute: traced("get_product_reviews", async (input) => {
      const { getProductReviews } = await import("@/lib/procurement/product-intelligence");
      return getProductReviews(input.productId as string, (input.limit as number) || 5);
    }),
  },
  {
    name: "view_cart",
    description:
      "View the current shopping cart contents. Returns each item with product details, quantity, unit price, line total, and the cart subtotal. The user must be signed in.",
    inputSchema: { type: "object", properties: {} },
    execute: traced("view_cart", async () => api("/api/cart")),
  },
  {
    name: "add_to_cart",
    description:
      "Add a product to the shopping cart. If the product is already in the cart, the quantity is added to the existing amount. The user must be signed in.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID to add" },
        quantity: { type: "number", description: "Quantity to add (default 1)" },
      },
      required: ["productId"],
    },
    execute: traced("add_to_cart", async (input) => {
      const result = await postJson("/api/cart", {
        action: "add",
        productId: input.productId,
        quantity: (input.quantity as number) || 1,
      });
      emit();
      return result;
    }),
  },
  {
    name: "update_cart_quantity",
    description:
      "Change the quantity of a product already in the cart. The user must be signed in.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID in the cart" },
        quantity: { type: "number", description: "New quantity (must be 1 or more)" },
      },
      required: ["productId", "quantity"],
    },
    execute: traced("update_cart_quantity", async (input) => {
      const result = await postJson("/api/cart", {
        action: "update",
        productId: input.productId,
        quantity: input.quantity,
      });
      emit();
      return result;
    }),
  },
  {
    name: "remove_from_cart",
    description:
      "Remove a product from the cart entirely. The user must be signed in.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID to remove" },
      },
      required: ["productId"],
    },
    execute: traced("remove_from_cart", async (input) => {
      const result = await postJson("/api/cart", {
        action: "remove",
        productId: input.productId,
      });
      emit();
      return result;
    }),
  },
  {
    name: "place_order",
    description:
      "Place an order from the current cart contents. Supports single payment or installment plans (3, 6, 12, or 24 months). Installments require minimum $100 cart total. Fees: 3/6 months 0%, 12 months 4%, 24 months 9%. The full order flow (prepare, approve, place) runs automatically. The user must be signed in.",
    inputSchema: {
      type: "object",
      properties: {
        installmentMonths: {
          type: "number",
          enum: [3, 6, 12, 24],
          description: "Installment duration in months. Omit for single payment.",
        },
      },
    },
    execute: traced("place_order", async (input) => {
      const prepared = await postJson("/api/orders/prepare", {
        installmentMonths: input.installmentMonths,
      });
      if (!prepared.success) return prepared;

      const approved = await postJson("/api/orders/approve", {
        proposalId: prepared.proposal.id,
        decision: "approve",
      });
      if (!approved.success) return approved;

      const placed = await postJson("/api/orders/place", {
        proposalId: approved.proposal.id,
      });
      emit();
      return placed;
    }),
  },
  {
    name: "view_orders",
    description:
      "View the user's complete order history. Returns all placed orders with items, subtotal, installment terms, fees, total, status, and creation date. The user must be signed in.",
    inputSchema: { type: "object", properties: {} },
    execute: traced("view_orders", async () => api("/api/orders")),
  },
];

export function WebMCPProvider() {
  useEffect(() => {
    const mc = getModelContext();
    if (!mc) return;

    const registered: string[] = [];
    for (const tool of toolDefs) {
      try {
        mc.registerTool(tool);
        registered.push(tool.name);
      } catch {
        // tool may already exist from HMR
      }
    }

    window.dispatchEvent(new CustomEvent("webmcp:ready", { detail: { tools: registered } }));

    return () => {
      for (const name of registered) {
        try {
          mc.unregisterTool(name);
        } catch {
          // already cleaned up
        }
      }
    };
  }, []);

  return null;
}
