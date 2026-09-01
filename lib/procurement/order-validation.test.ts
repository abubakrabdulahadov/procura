import { describe, expect, it } from "vitest";
import { validateApprovedOrder } from "./order-validation";
import type { Cart, OrderProposal, ProductAvailabilityResult } from "../../types/procurement";

const product = {
  id: "monitor-1",
  name: "Work Monitor",
  brand: "Procura",
  category: "monitor" as const,
  price: 250,
  specs: { sizeInches: 27 },
};

const cart: Cart = {
  id: "cart-active",
  items: [{ product, quantity: 2, unitPrice: 250, lineTotal: 500 }],
  itemCount: 2,
  subtotal: 500,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const proposal: OrderProposal = {
  id: "proposal-1",
  cart,
  subtotal: 500,
  paymentFee: 0,
  total: 500,
  deliveryMinDays: 1,
  deliveryMaxDays: 3,
  status: "approved",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const available = (): ProductAvailabilityResult => ({
  success: true,
  availability: {
    productId: product.id,
    availableQuantity: 10,
    deliveryMinDays: 1,
    deliveryMaxDays: 3,
    deliveryLabel: "1–3 business days",
  },
  requestedQuantity: 2,
  canFulfill: true,
});

describe("validateApprovedOrder", () => {
  it("accepts an unchanged, available order within budget", () => {
    expect(
      validateApprovedOrder(proposal, cart, { hasLimit: true, remaining: 600 }, available),
    ).toBeNull();
  });

  it("rejects a cart quantity changed after approval", () => {
    const changed = { ...cart, items: [{ ...cart.items[0], quantity: 1, lineTotal: 250 }] };
    expect(
      validateApprovedOrder(proposal, changed, { hasLimit: false, remaining: 0 }, available)?.code,
    ).toBe("CART_CHANGED_AFTER_APPROVAL");
  });

  it("rejects an order that is no longer available", () => {
    const unavailable = (): ProductAvailabilityResult => ({
      success: false,
      error: { code: "INSUFFICIENT_STOCK", message: "Out of stock" },
    });
    expect(
      validateApprovedOrder(proposal, cart, { hasLimit: false, remaining: 0 }, unavailable)?.code,
    ).toBe("INSUFFICIENT_STOCK");
  });

  it("rejects an order that exceeds the latest remaining budget", () => {
    expect(
      validateApprovedOrder(proposal, cart, { hasLimit: true, remaining: 499 }, available)?.code,
    ).toBe("BUDGET_EXCEEDED");
  });
});
