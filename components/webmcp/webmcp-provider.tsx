"use client";

import { useEffect } from "react";

interface ToolInput {
  [key: string]: unknown;
}

interface ToolExecuteContext {
  signal: AbortSignal;
}

interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: ToolInput, context: ToolExecuteContext) => Promise<string>;
}

interface ToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

interface ModelContext {
  registerTool: (tool: ToolDef, options?: ToolOptions) => Promise<void>;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return res.json().catch(() => ({ success: false, error: "Server error" }));
}

async function postJson(url: string, body: Record<string, unknown>) {
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

function emitToolStart(name: string, title: string | undefined, input: ToolInput) {
  const id = ++callId;
  window.dispatchEvent(
    new CustomEvent("webmcp:tool-start", { detail: { id, name, title, input } }),
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
  title: string | undefined,
  fn: (input: ToolInput) => Promise<string>,
): (input: ToolInput, context: ToolExecuteContext) => Promise<string> {
  return async (input, _context) => {
    const id = emitToolStart(name, title, input);
    try {
      const result = await fn(input);
      const parsed = JSON.parse(result);
      const ok =
        parsed && typeof parsed === "object" && "success" in parsed
          ? parsed.success !== false
          : true;
      emitToolEnd(id, name, ok);
      return result;
    } catch (err) {
      emitToolEnd(id, name, false);
      throw err;
    }
  };
}

function json(data: unknown): string {
  return JSON.stringify(data);
}

const toolDefs: ToolDef[] = [
  {
    name: "check_auth_status",
    title: "Auth Status",
    description:
      "Check if the user is signed in. Returns user name and email if authenticated, or signed_in: false. Call this before any tool that requires authentication.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("check_auth_status", "Auth Status", async () => {
      const session = await api("/api/auth/session");
      if (session.user) {
        return json({
          success: true,
          signed_in: true,
          user: { name: session.user.name, email: session.user.email },
        });
      }
      return json({
        success: true,
        signed_in: false,
        message: "User is not signed in. They need to sign in at /login before using cart or order tools.",
      });
    }),
  },
  {
    name: "search_products",
    title: "Search Products",
    description:
      "Search the Procura procurement catalog. Returns products with ID, name, brand, category, price, and specs. Use filters to narrow results.",
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
          description: "USB-C connectivity filter",
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: traced("search_products", "Search Products", async (input) => {
      const { searchProducts } = await import("@/lib/procurement/products");
      const result = searchProducts({
        category: input.category as never,
        maxPrice: input.maxPrice as number | undefined,
        usbC: input.usbC as boolean | undefined,
      });
      if (!result.success) return json(result);
      return json({
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
      });
    }),
  },
  {
    name: "get_product_details",
    title: "Product Details",
    description:
      "Get full details for a product by ID. Returns specs, rating, reviews, stock, delivery, and installment options.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID" },
      },
      required: ["productId"],
    },
    annotations: { readOnlyHint: true },
    execute: traced("get_product_details", "Product Details", async (input) => {
      const {
        getProduct,
        checkProductAvailability,
        getInstallmentOptions,
      } = await import("@/lib/procurement/product-intelligence");
      const detail = getProduct(input.productId as string);
      if (!detail.success) return json(detail);
      const avail = checkProductAvailability(input.productId as string, 1);
      const installments = getInstallmentOptions(input.productId as string, 1);
      return json({
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
      });
    }),
  },
  {
    name: "get_product_reviews",
    title: "Product Reviews",
    description:
      "Get customer reviews for a product. Returns star ratings, title, body, author, and verified purchase status.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID" },
        limit: { type: "number", description: "Reviews to return (1-10, default 5)" },
      },
      required: ["productId"],
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: traced("get_product_reviews", "Product Reviews", async (input) => {
      const { getProductReviews } = await import("@/lib/procurement/product-intelligence");
      return json(getProductReviews(input.productId as string, (input.limit as number) || 5));
    }),
  },
  {
    name: "view_cart",
    title: "View Cart",
    description:
      "View shopping cart contents with items, quantities, prices, and subtotal. Requires sign-in — call check_auth_status first.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("view_cart", "View Cart", async () => json(await api("/api/cart"))),
  },
  {
    name: "add_to_cart",
    title: "Add to Cart",
    description:
      "Add a product to the cart. Stacks quantity if already present. Requires sign-in — call check_auth_status first.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID to add" },
        quantity: { type: "number", description: "Quantity (default 1)" },
      },
      required: ["productId"],
    },
    annotations: { readOnlyHint: false },
    execute: traced("add_to_cart", "Add to Cart", async (input) => {
      const result = await postJson("/api/cart", {
        action: "add",
        productId: input.productId,
        quantity: (input.quantity as number) || 1,
      });
      emit();
      return json(result);
    }),
  },
  {
    name: "update_cart_quantity",
    title: "Update Quantity",
    description:
      "Change quantity of a cart item. Requires sign-in — call check_auth_status first.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID in cart" },
        quantity: { type: "number", description: "New quantity (min 1)" },
      },
      required: ["productId", "quantity"],
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
    execute: traced("update_cart_quantity", "Update Quantity", async (input) => {
      const result = await postJson("/api/cart", {
        action: "update",
        productId: input.productId,
        quantity: input.quantity,
      });
      emit();
      return json(result);
    }),
  },
  {
    name: "remove_from_cart",
    title: "Remove from Cart",
    description:
      "Remove a product from the cart entirely. Requires sign-in — call check_auth_status first.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID to remove" },
      },
      required: ["productId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    execute: traced("remove_from_cart", "Remove from Cart", async (input) => {
      const result = await postJson("/api/cart", {
        action: "remove",
        productId: input.productId,
      });
      emit();
      return json(result);
    }),
  },
  {
    name: "place_order",
    title: "Place Order",
    description:
      "Place an order from cart. Supports installments (3, 6, 12, 24 months). Min $100 for installments. Fees: 3/6mo 0%, 12mo 4%, 24mo 9%. Requires sign-in — call check_auth_status first.",
    inputSchema: {
      type: "object",
      properties: {
        installmentMonths: {
          type: "number",
          enum: [3, 6, 12, 24],
          description: "Installment months. Omit for single payment.",
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    execute: traced("place_order", "Place Order", async (input) => {
      const prepared = await postJson("/api/orders/prepare", {
        installmentMonths: input.installmentMonths,
      });
      if (!prepared.success) return json(prepared);

      const approved = await postJson("/api/orders/approve", {
        proposalId: prepared.proposal.id,
        decision: "approve",
      });
      if (!approved.success) return json(approved);

      const placed = await postJson("/api/orders/place", {
        proposalId: approved.proposal.id,
      });
      emit();
      return json(placed);
    }),
  },
  {
    name: "view_orders",
    title: "Order History",
    description:
      "View all placed orders with items, totals, installment terms, status, and dates. Requires sign-in — call check_auth_status first.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("view_orders", "Order History", async () => json(await api("/api/orders"))),
  },
];

export function WebMCPProvider() {
  useEffect(() => {
    const mc = (document as unknown as { modelContext?: ModelContext }).modelContext;
    if (!mc) return;

    const controller = new AbortController();

    for (const tool of toolDefs) {
      mc.registerTool(tool, { signal: controller.signal }).catch(() => {});
    }

    window.dispatchEvent(
      new CustomEvent("webmcp:ready", {
        detail: { tools: toolDefs.map((t) => t.name) },
      }),
    );

    return () => {
      controller.abort();
    };
  }, []);

  return null;
}
