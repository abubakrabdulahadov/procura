"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

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
  try {
    const res = await fetch(url, init);
    return await res.json().catch(() => ({
      success: false,
      error: {
        code: "INVALID_RESPONSE",
        message: `The server returned a non-JSON response (HTTP ${res.status}).`,
      },
    }));
  } catch {
    return {
      success: false,
      error: { code: "NETWORK_ERROR", message: "Could not reach the Procura server." },
    };
  }
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
  fn: (input: ToolInput, context: ToolExecuteContext) => Promise<string>,
): (input: ToolInput, context: ToolExecuteContext) => Promise<string> {
  return async (input, context) => {
    const id = emitToolStart(name, title, input);
    try {
      const result = await fn(input, context);
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

const APPROVAL_TIMEOUT_MS = 120_000;
let approvalSeq = 0;

interface ApprovalOutcome {
  requestId: string;
  decision: "approve" | "reject" | "timeout" | "cancelled";
}

/**
 * Hands a prepared proposal to the human and waits for their decision.
 *
 * The agent cannot approve on the user's behalf: the only thing that resolves
 * this promise as approved is a click in the page's own approval panel.
 */
function requestHumanApproval(
  proposal: unknown,
  signal: AbortSignal | undefined,
): Promise<ApprovalOutcome> {
  return new Promise((resolve) => {
    const requestId = `approval-${++approvalSeq}`;
    let settled = false;

    const settle = (decision: ApprovalOutcome["decision"]) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("webmcp:approval-response", onResponse);
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
      resolve({ requestId, decision });
    };

    const onResponse = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        requestId: string;
        decision: "approve" | "reject";
      };
      if (detail.requestId !== requestId) return;
      settle(detail.decision);
    };

    const dismiss = () =>
      window.dispatchEvent(
        new CustomEvent("webmcp:approval-cancel", { detail: { requestId } }),
      );

    const onAbort = () => {
      dismiss();
      settle("cancelled");
    };

    const timer = setTimeout(() => {
      dismiss();
      settle("timeout");
    }, APPROVAL_TIMEOUT_MS);

    window.addEventListener("webmcp:approval-response", onResponse);
    signal?.addEventListener("abort", onAbort);
    window.dispatchEvent(
      new CustomEvent("webmcp:approval-request", { detail: { requestId, proposal } }),
    );
  });
}

function closeApprovalPanel(requestId: string) {
  window.dispatchEvent(
    new CustomEvent("webmcp:approval-resolved", { detail: { requestId } }),
  );
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
      "Search the Procura procurement catalog. Returns products with ID, name, brand, category, price, and specs. All filters are optional and combine with AND. Uses the same search the catalog UI runs, so results match what the user sees.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text match against brand and product name, e.g. 'thinkpad' or 'dell'",
        },
        category: {
          type: "string",
          enum: ["monitor", "laptop", "accessory", "office", "furniture", "facilities"],
          description: "Filter by product category",
        },
        minPrice: {
          type: "number",
          description: "Minimum unit price in USD",
        },
        maxPrice: {
          type: "number",
          description: "Maximum unit price in USD",
        },
        minSizeInches: {
          type: "number",
          description: "Minimum display size in inches (monitors and laptops)",
        },
        minResolution: {
          type: "string",
          description: "Minimum display resolution as WIDTHxHEIGHT, e.g. '2560x1440'. Compares by pixel area.",
        },
        usbC: {
          type: "boolean",
          description: "Filter to products with (true) or without (false) USB-C",
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: traced("search_products", "Search Products", async (input) => {
      const { searchProducts } = await import("@/lib/procurement/products");
      const result = searchProducts({
        query: input.query as string | undefined,
        category: input.category as never,
        minPrice: input.minPrice as number | undefined,
        maxPrice: input.maxPrice as number | undefined,
        minSizeInches: input.minSizeInches as number | undefined,
        minResolution: input.minResolution as string | undefined,
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
    name: "get_installment_options",
    title: "Installment Options",
    description:
      "Get every installment plan for a product at a given quantity — monthly payment, fee, and total payable for 3, 6, 12, and 24 months. Fees: 3/6 months 0%, 12 months 4%, 24 months 9%. Plans require a line total of at least $100, so quantity changes eligibility. Use this to model financing before adding anything to the cart.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product ID" },
        quantity: { type: "number", description: "Units to finance (default 1)" },
      },
      required: ["productId"],
    },
    annotations: { readOnlyHint: true },
    execute: traced("get_installment_options", "Installment Options", async (input) => {
      const { getInstallmentOptions } = await import("@/lib/procurement/product-intelligence");
      return json(getInstallmentOptions(input.productId as string, (input.quantity as number) || 1));
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
    annotations: { readOnlyHint: false, idempotentHint: true },
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
  {
    name: "highlight_products",
    title: "Recommend Products",
    description:
      "Highlight products as 'Recommended' on the catalog page with a visible badge and auto-scroll to the first one. Call with an empty array to clear highlights. User must be on the catalog page.",
    inputSchema: {
      type: "object",
      properties: {
        productIds: {
          type: "array",
          items: { type: "string" },
          description: "Product IDs to highlight as recommended",
        },
      },
      required: ["productIds"],
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
    execute: traced("highlight_products", "Recommend Products", async (input) => {
      const ids = input.productIds as string[];
      const onCatalog = document.querySelector("[data-product-id]") !== null;
      if (!onCatalog)
        return json({
          success: false,
          error: {
            code: "NOT_ON_CATALOG",
            message:
              "Highlights render on the catalog product grid, which is not on screen. Call navigate_to with page 'catalog' first, then retry.",
          },
        });

      window.dispatchEvent(new CustomEvent("webmcp:highlight", { detail: { productIds: ids } }));
      if (ids.length === 0) return json({ success: true, message: "Highlights cleared." });

      const visible = ids.filter((id) => document.querySelector(`[data-product-id="${CSS.escape(id)}"]`));
      const notVisible = ids.filter((id) => !visible.includes(id));
      return json({
        success: true,
        highlighted: visible.length,
        productIds: visible,
        ...(notVisible.length > 0 && {
          notVisible,
          note: "These products are not in the current filtered view, so their badges are not on screen. Clear or widen the catalog filters to reveal them.",
        }),
      });
    }),
  },
  {
    name: "get_page_context",
    title: "Page Context",
    description:
      "Get detailed context about what the user is currently viewing — visible products, cart contents, active filters, etc. Richer than check_auth_status for understanding the user's current screen.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("get_page_context", "Page Context", async () => {
      const ctx = (window as unknown as { __procuraPageContext?: Record<string, unknown> }).__procuraPageContext;
      if (!ctx) return json({ success: true, page: window.location.pathname, context: null });
      return json({ success: true, ...ctx });
    }),
  },
  {
    name: "compare_products",
    title: "Compare Products",
    description:
      "Open a side-by-side comparison table over the current page for 2-4 products. Rows: price, rating, purchased count, delivery, category, and every spec the products have. The table reports catalog facts only — you decide what counts as better. Mark your overall pick(s) with 'recommended', and the winner of an individual row with 'highlights'. Row keys usable in highlights: price, rating, purchasedCount, delivery, category, sizeInches, resolution, refreshRateHz, ramGb, storageGb, batteryHours, usbC, connection, material, packSize. Call with an empty productIds array to close.",
    inputSchema: {
      type: "object",
      properties: {
        productIds: {
          type: "array",
          items: { type: "string" },
          description: "Product IDs to compare (2-4 works best on screen)",
        },
        recommended: {
          type: "array",
          items: { type: "string" },
          description: "Product IDs you recommend overall — shown with an 'Agent Pick' badge",
        },
        highlights: {
          type: "object",
          description:
            "Per-row winner as { rowKey: productId }, e.g. { \"price\": \"hp-e27q-g5\", \"resolution\": \"lg-27up850n-w\" }. That cell is highlighted as the best value for that row.",
        },
        note: {
          type: "string",
          description: "One short line shown above the table explaining your reasoning to the user",
        },
      },
      required: ["productIds"],
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
    execute: traced("compare_products", "Compare Products", async (input) => {
      const ids = input.productIds as string[];
      if (ids.length === 0) {
        window.dispatchEvent(new CustomEvent("webmcp:compare", { detail: { productIds: [] } }));
        return json({ success: true, message: "Comparison closed." });
      }

      const { searchProducts } = await import("@/lib/procurement/products");
      const all = searchProducts({});
      const known = new Set(all.success ? all.products.map((p) => p.id) : []);
      const valid = ids.filter((id) => known.has(id));
      const unknown = ids.filter((id) => !known.has(id));

      if (valid.length === 0)
        return json({
          success: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: `None of these product IDs exist in the catalog: ${unknown.join(", ")}. Use search_products to get valid IDs.`,
          },
        });

      window.dispatchEvent(
        new CustomEvent("webmcp:compare", {
          detail: {
            productIds: valid,
            recommended: input.recommended as string[] | undefined,
            highlights: input.highlights as Record<string, string> | undefined,
            note: input.note as string | undefined,
          },
        }),
      );
      return json({
        success: true,
        comparing: valid.length,
        productIds: valid,
        ...(unknown.length > 0 && {
          skipped: unknown,
          note: "These IDs are not in the catalog and were left out of the table.",
        }),
      });
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
        source: "agent",
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
      "Prepare an order from the cart and ask the user to approve it. This PAUSES until the user approves or rejects it in the page's approval panel — you cannot approve on their behalf, and nothing is charged without their click. Tell them to expect the panel, then wait for the result. Pass productIds to order specific items only, or omit to order everything. Installments (3, 6, 12, 24 months) require each item's line total >= $100. Fees: 3/6mo 0%, 12mo 4%, 24mo 9%. Blocked if it exceeds the user's budget. Use preview_order first if you only want to show costs without prompting them.",
    inputSchema: {
      type: "object",
      properties: {
        productIds: {
          type: "array",
          items: { type: "string" },
          description: "Product IDs to order. Omit to order all cart items.",
        },
        installmentMonths: {
          type: "number",
          enum: [3, 6, 12, 24],
          description: "Installment months. Omit for single payment.",
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    execute: traced("place_order", "Place Order", async (input, context) => {
      const prepared = await postJson("/api/orders/prepare", {
        installmentMonths: input.installmentMonths,
        productIds: input.productIds,
        source: "agent",
      });
      if (!prepared.success) return json(prepared);

      // The proposal is priced but not purchasable. Only the human can move it
      // past pending_human_approval, through the page's own approval panel.
      const outcome = await requestHumanApproval(prepared.proposal, context?.signal);

      if (outcome.decision !== "approve") {
        const reason = {
          reject: {
            code: "APPROVAL_DECLINED",
            message:
              "The user reviewed the order and declined it. Nothing was charged and the cart is unchanged. Ask what they would like to change before trying again.",
          },
          timeout: {
            code: "APPROVAL_TIMEOUT",
            message:
              "The user did not respond to the approval panel in time. Nothing was charged. Confirm they are still there before retrying.",
          },
          cancelled: {
            code: "APPROVAL_CANCELLED",
            message: "The approval request was cancelled before the user decided. Nothing was charged.",
          },
        }[outcome.decision];
        return json({ success: false, proposalId: prepared.proposal.id, error: reason });
      }

      const approved = await postJson("/api/orders/approve", {
        proposalId: prepared.proposal.id,
        decision: "approve",
      });
      if (!approved.success) {
        closeApprovalPanel(outcome.requestId);
        return json(approved);
      }

      const placed = await postJson("/api/orders/place", {
        proposalId: approved.proposal.id,
      });
      closeApprovalPanel(outcome.requestId);
      emit();
      return json(
        placed.success
          ? { ...placed, approvedBy: "user", message: `${placed.message} Approved by the user.` }
          : placed,
      );
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
        source: "agent",
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
  {
    name: "get_spending_analytics",
    title: "Spending Analytics",
    description:
      "Get spending analytics — total spent, order count, average order value, category breakdown, top category, and budget utilization. Data only, no interpretation.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: traced("get_spending_analytics", "Spending Analytics", async () =>
      json(await api("/api/analytics")),
    ),
  },
  {
    name: "bulk_add_to_cart",
    title: "Bulk Add to Cart",
    description:
      "Add multiple products to cart in one call. Each item needs a productId and optional quantity (default 1). Faster than calling add_to_cart repeatedly.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Product ID" },
              quantity: { type: "number", description: "Quantity (default 1)" },
            },
            required: ["productId"],
          },
          description: "Products to add",
        },
      },
      required: ["items"],
    },
    annotations: { readOnlyHint: false },
    execute: traced("bulk_add_to_cart", "Bulk Add to Cart", async (input) => {
      const items = input.items as { productId: string; quantity?: number }[];
      const results: { productId: string; success: boolean; message?: string }[] = [];
      for (const item of items) {
        const res = await postJson("/api/cart", {
          action: "add",
          productId: item.productId,
          quantity: item.quantity ?? 1,
          source: "agent",
        });
        results.push({
          productId: item.productId,
          success: !!res.success,
          message: res.message ?? res.error?.message,
        });
      }
      emit();
      const added = results.filter((r) => r.success).length;
      return json({ success: true, added, total: items.length, results });
    }),
  },
  {
    name: "get_order_details",
    title: "Order Details",
    description:
      "Get full details of a specific order by ID — items, quantities, prices, payment terms, status, who placed/cancelled it, and timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order ID (e.g. ORD-XXXXXXXX)" },
      },
      required: ["orderId"],
    },
    annotations: { readOnlyHint: true },
    execute: traced("get_order_details", "Order Details", async (input) =>
      json(await api(`/api/orders/${encodeURIComponent(input.orderId as string)}`)),
    ),
  },
  {
    name: "restore_cancelled_order",
    title: "Restore to Cart",
    description:
      "Restore all items from a cancelled order back into the shopping cart. Only works on cancelled orders. Items are re-added with their original quantities.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Cancelled order ID to restore" },
      },
      required: ["orderId"],
    },
    annotations: { readOnlyHint: false },
    execute: traced("restore_cancelled_order", "Restore to Cart", async (input) => {
      const result = await postJson("/api/orders/restore", {
        orderId: input.orderId,
        source: "agent",
      });
      emit();
      return json(result);
    }),
  },
  {
    name: "preview_order",
    title: "Order Preview",
    description:
      "Preview what an order would cost without placing it. Shows items, subtotal, installment fees, monthly payment, total, budget status, and delivery estimate. Use this to help the user compare options before committing.",
    inputSchema: {
      type: "object",
      properties: {
        productIds: {
          type: "array",
          items: { type: "string" },
          description: "Product IDs to include. Omit to preview all cart items.",
        },
        installmentMonths: {
          type: "number",
          enum: [3, 6, 12, 24],
          description: "Installment plan to preview. Omit for single payment.",
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: traced("preview_order", "Order Preview", async (input) =>
      json(await postJson("/api/orders/preview", {
        productIds: input.productIds,
        installmentMonths: input.installmentMonths,
      })),
    ),
  },
  {
    name: "reorder",
    title: "Reorder",
    description:
      "Re-add all items from a previous order to the cart. Works on any order (placed or cancelled). Items are added with their original quantities. Use place_order afterwards to complete the reorder.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order ID to reorder from" },
      },
      required: ["orderId"],
    },
    annotations: { readOnlyHint: false },
    execute: traced("reorder", "Reorder", async (input) => {
      const result = await postJson("/api/orders/reorder", {
        orderId: input.orderId,
        source: "agent",
      });
      emit();
      return json(result);
    }),
  },
];

export function WebMCPProvider() {
  const router = useRouter();
  const pathname = usePathname();

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
  }, [pathname]);

  return null;
}
