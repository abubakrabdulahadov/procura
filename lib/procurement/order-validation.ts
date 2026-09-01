import type { Cart, OrderProposal, ProductAvailabilityResult } from "@/types/procurement";

interface BudgetSnapshot {
  hasLimit: boolean;
  remaining: number;
}

export type PlacementValidationError = {
  code: "CART_CHANGED_AFTER_APPROVAL" | "INSUFFICIENT_STOCK" | "BUDGET_EXCEEDED";
  message: string;
};

export function validateApprovedOrder(
  proposal: OrderProposal,
  currentCart: Cart,
  budget: BudgetSnapshot,
  getAvailability: (productId: string, quantity: number) => ProductAvailabilityResult,
): PlacementValidationError | null {
  const currentItems = new Map(currentCart.items.map((item) => [item.product.id, item]));
  const cartChanged = proposal.cart.items.some((approvedItem) => {
    const currentItem = currentItems.get(approvedItem.product.id);
    return (
      !currentItem ||
      currentItem.quantity !== approvedItem.quantity ||
      currentItem.unitPrice !== approvedItem.unitPrice ||
      currentItem.lineTotal !== approvedItem.lineTotal
    );
  });
  if (cartChanged)
    return {
      code: "CART_CHANGED_AFTER_APPROVAL",
      message:
        "The approved cart changed before the order was placed. Review and approve a new proposal.",
    };

  const unavailableItems = proposal.cart.items.filter((item) => {
    const availability = getAvailability(item.product.id, item.quantity);
    return !availability.success || !availability.canFulfill;
  });
  if (unavailableItems.length > 0)
    return {
      code: "INSUFFICIENT_STOCK",
      message: `Availability changed for: ${unavailableItems.map((item) => item.product.name).join(", ")}. Review and approve a new proposal.`,
    };

  if (budget.hasLimit && proposal.total > budget.remaining)
    return {
      code: "BUDGET_EXCEEDED",
      message: `This order now exceeds the remaining budget of $${budget.remaining.toFixed(2)}. Review and approve a new proposal.`,
    };

  return null;
}
