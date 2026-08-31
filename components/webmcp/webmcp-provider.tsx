"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

let globalNavigate: ((path: string) => void) | null = null;

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

// --- Tool definitions split by auth requirement ---

const publicTools: ToolDef[] = [
  {
    name: "check_auth_status",
    title: "Auth Status",
    description:
      "Check if the user is signed in and which page they're on. Returns auth state, user info, and currentPage.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("check_auth_status", "Auth Status", async () => {
      const path = window.location.pathname;
      const pageMap: Record<string, string> = {
        "/": "catalog",
        "/cart": "cart",
        "/orders": "orders",
        "/login": "login",
        "/signup": "signup",
      };
      const currentPage = path.startsWith("/product/")
        ? `product:${path.slice("/product/".length)}`
        : pageMap[path] ?? path;
      const session = await api("/api/auth/session");
      if (session.user) {
        return json({
          success: true,
          signed_in: true,
          currentPage,
          user: { name: session.user.name, email: session.user.email },
        });
      }
      return json({
        success: true,
        signed_in: false,
        currentPage,
        message: "User is not signed in. Use navigate_to with page 'login' so they can sign in.",
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
    name: "navigate_to",
    title: "Navigate",
    description:
      "Navigate the user to a page in Procura. Use after adding items to cart, when showing product details, or when the user needs to see a specific page.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["catalog", "cart", "orders", "login", "signup", "product"],
          description: "Target page. Use 'product' with productId to show a product detail page.",
        },
        productId: {
          type: "string",
          description: "Required when page is 'product'. The product ID to show.",
        },
      },
      required: ["page"],
    },
    annotations: { readOnlyHint: true },
    execute: traced("navigate_to", "Navigate", async (input) => {
      const page = input.page as string;
      const nav = globalNavigate ?? ((p: string) => { window.location.href = p; });
      if (page === "product") {
        if (!input.productId) return json({ success: false, error: "productId is required for product page." });
        nav(`/product/${encodeURIComponent(input.productId as string)}`);
        return json({ success: true, navigated_to: "product", productId: input.productId });
      }
      const routes: Record<string, string> = {
        catalog: "/",
        cart: "/cart",
        orders: "/orders",
        login: "/login",
        signup: "/signup",
      };
      const path = routes[page];
      if (!path) return json({ success: false, error: "Unknown page." });
      nav(path);
      return json({ success: true, navigated_to: page });
    }),
  },
];

const authTools: ToolDef[] = [
  {
    name: "view_cart",
    title: "View Cart",
    description:
      "View shopping cart contents with items, quantities, prices, and subtotal.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("view_cart", "View Cart", async () => json(await api("/api/cart"))),
  },
  {
    name: "add_to_cart",
    title: "Add to Cart",
    description:
      "Add a product to the cart. Stacks quantity if already present.",
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
    description: "Change quantity of a cart item.",
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
    description: "Remove a product from the cart entirely.",
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
      "Place an order from cart. Installments (3, 6, 12, 24 months) require each item's line total >= $100. Fees: 3/6mo 0%, 12mo 4%, 24mo 9%. Blocked if it exceeds the user's budget.",
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
      "View all orders with items, totals, installment terms, status, and dates.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("view_orders", "Order History", async () => json(await api("/api/orders"))),
  },
  {
    name: "cancel_order",
    title: "Cancel Order",
    description:
      "Cancel an active order by its ID. Only placed (active) orders can be cancelled.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order ID to cancel" },
      },
      required: ["orderId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    execute: traced("cancel_order", "Cancel Order", async (input) => {
      const result = await postJson("/api/orders/cancel", {
        orderId: input.orderId,
      });
      emit();
      return json(result);
    }),
  },
  {
    name: "get_budget",
    title: "View Budget",
    description:
      "Get the user's procurement budget — limit, amount spent, and remaining balance. Returns hasLimit: false if no budget is set.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("get_budget", "View Budget", async () => json(await api("/api/budget"))),
  },
  {
    name: "set_budget",
    title: "Set Budget",
    description:
      "Set a procurement spending limit. Orders that would exceed this limit are blocked. Set to 0 to remove the limit.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Budget limit in USD (0 to remove)" },
      },
      required: ["limit"],
    },
    annotations: { readOnlyHint: false },
    execute: traced("set_budget", "Set Budget", async (input) => {
      const result = await postJson("/api/budget", { limit: input.limit });
      emit();
      return json(result);
    }),
  },
];

export function WebMCPProvider() {
  const router = useRouter();

  useEffect(() => {
    globalNavigate = (path: string) => router.push(path);
    return () => { globalNavigate = null; };
  }, [router]);

  useEffect(() => {
    const mc = (document as unknown as { modelContext?: ModelContext }).modelContext;
    if (!mc) return;

    const publicController = new AbortController();
    let authController: AbortController | null = null;

    for (const tool of publicTools) {
      mc.registerTool(tool, { signal: publicController.signal }).catch(() => {});
    }

    async function syncAuthTools() {
      if (!mc) return;
      const session = await api("/api/auth/session");
      const isSignedIn = !!session.user;

      if (isSignedIn && !authController) {
        authController = new AbortController();
        for (const tool of authTools) {
          mc.registerTool(tool, { signal: authController.signal }).catch(() => {});
        }
      } else if (!isSignedIn && authController) {
        authController.abort();
        authController = null;
      }

      window.dispatchEvent(
        new CustomEvent("webmcp:ready", {
          detail: {
            tools: [
              ...publicTools.map((t) => t.name),
              ...(isSignedIn ? authTools.map((t) => t.name) : []),
            ],
          },
        }),
      );
    }

    syncAuthTools();

    const onSync = () => syncAuthTools();
    window.addEventListener("webmcp:sync", onSync);

    return () => {
      window.removeEventListener("webmcp:sync", onSync);
      publicController.abort();
      authController?.abort();
    };
  }, []);

  return null;
}
