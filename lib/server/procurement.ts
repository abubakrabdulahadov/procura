import { and, desc, eq } from "drizzle-orm";
import { products } from "@/lib/data/mock";
import { checkProductAvailability } from "@/lib/procurement/product-intelligence";
import { db } from "@/lib/server/database";
import { budgets, carts, orderProposals, orders } from "@/lib/server/schema";
import type { Cart, Order, OrderProposal } from "@/types/procurement";

function cartSnapshot(row: { quantitiesJson: string; updatedAt: string }): Cart {
  const quantities = JSON.parse(row.quantitiesJson) as Record<string, number>;
  const items = Object.entries(quantities).flatMap(([productId, quantity]) => {
    const product = products.find((candidate) => candidate.id === productId);
    return product
      ? [
          {
            product,
            quantity,
            unitPrice: product.price,
            lineTotal: Number((product.price * quantity).toFixed(2)),
          },
        ]
      : [];
  });
  return {
    id: "cart-active",
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)),
    updatedAt: row.updatedAt,
  };
}

export async function getUserCart(userId: string): Promise<Cart> {
  let [row] = await db
    .select({ quantitiesJson: carts.quantitiesJson, updatedAt: carts.updatedAt })
    .from(carts)
    .where(eq(carts.userId, userId));
  if (!row) {
    const updatedAt = new Date(0).toISOString();
    await db.insert(carts).values({ userId, quantitiesJson: "{}", updatedAt });
    row = { quantitiesJson: "{}", updatedAt };
  }
  return cartSnapshot(row);
}

export async function mutateUserCart(
  userId: string,
  action: "add" | "update" | "remove",
  productId: string,
  quantity?: number,
) {
  const product = products.find((candidate) => candidate.id === productId);
  if (!product)
    return {
      success: false as const,
      error: {
        code: "PRODUCT_NOT_FOUND",
        message: `No catalog product exists with ID ${productId}.`,
      },
    };
  const current = await getUserCart(userId);
  const quantities = Object.fromEntries(
    current.items.map((item) => [item.product.id, item.quantity]),
  );
  if (action !== "remove" && (!Number.isInteger(quantity) || (quantity ?? 0) < 1))
    return {
      success: false as const,
      error: { code: "INVALID_QUANTITY", message: "quantity must be a positive integer." },
    };
  if (action === "add") quantities[productId] = (quantities[productId] ?? 0) + (quantity ?? 0);
  if (action === "update") {
    if (!quantities[productId])
      return {
        success: false as const,
        error: { code: "ITEM_NOT_IN_CART", message: `Product ${productId} is not in the cart.` },
      };
    quantities[productId] = quantity ?? 1;
  }
  if (action === "remove") {
    if (!quantities[productId])
      return {
        success: false as const,
        error: { code: "ITEM_NOT_IN_CART", message: `Product ${productId} is not in the cart.` },
      };
    delete quantities[productId];
  }
  const updatedAt = new Date().toISOString();
  await db
    .update(carts)
    .set({ quantitiesJson: JSON.stringify(quantities), updatedAt })
    .where(eq(carts.userId, userId));
  const cart = await getUserCart(userId);
  const message =
    action === "add"
      ? `${quantity} × ${product.name} added to cart.`
      : action === "update"
        ? `Cart quantity updated to ${quantity}.`
        : `${product.name} removed from cart.`;
  return { success: true as const, cart, message };
}

export async function prepareUserOrder(userId: string, installmentMonths?: number, productIds?: string[]) {
  const fullCart = await getUserCart(userId);
  if (!fullCart.items.length)
    return {
      success: false as const,
      error: { code: "EMPTY_CART", message: "Add at least one product before preparing an order." },
    };
  const selectedItems = productIds
    ? fullCart.items.filter((item) => productIds.includes(item.product.id))
    : fullCart.items;
  if (selectedItems.length === 0)
    return {
      success: false as const,
      error: { code: "EMPTY_CART", message: "None of the selected products are in the cart." },
    };
  const subtotal = Number(selectedItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
  const orderCart: Cart = {
    id: fullCart.id,
    items: selectedItems,
    itemCount: selectedItems.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    updatedAt: fullCart.updatedAt,
  };
  if (installmentMonths !== undefined && ![3, 6, 12, 24].includes(installmentMonths))
    return {
      success: false as const,
      error: {
        code: "INVALID_INSTALLMENT_TERM",
        message: "installmentMonths must be 3, 6, 12, or 24.",
      },
    };
  if (installmentMonths !== undefined && subtotal < 100)
    return {
      success: false as const,
      error: {
        code: "INVALID_INSTALLMENT_TERM",
        message: "Installment plans require a minimum order of $100.",
      },
    };
  if (installmentMonths !== undefined) {
    const ineligible = selectedItems.filter((item) => item.lineTotal < 100);
    if (ineligible.length > 0)
      return {
        success: false as const,
        error: {
          code: "INVALID_INSTALLMENT_TERM",
          message: `Installment plans require each item total to be at least $100. These items don't qualify: ${ineligible.map((i) => `${i.product.name} ($${i.lineTotal.toFixed(2)})`).join(", ")}. Remove them or increase quantity to reach $100 per item, or choose single payment.`,
        },
      };
  }
  const budget = await getUserBudget(userId);
  const rate = installmentMonths === 12 ? 0.04 : installmentMonths === 24 ? 0.09 : 0;
  const paymentFee = Number((subtotal * rate).toFixed(2));
  const orderTotal = Number((subtotal + paymentFee).toFixed(2));
  if (budget.hasLimit && orderTotal > budget.remaining)
    return {
      success: false as const,
      error: {
        code: "BUDGET_EXCEEDED",
        message: `This order ($${orderTotal.toFixed(2)}) exceeds your remaining budget of $${budget.remaining.toFixed(2)} (limit: $${budget.limit.toFixed(2)}, spent: $${budget.spent.toFixed(2)}).`,
      },
    };
  const ranges = selectedItems
    .map((item) => checkProductAvailability(item.product.id, item.quantity))
    .filter((item) => item.success);
  const proposal: OrderProposal = {
    id: `proposal-${crypto.randomUUID()}`,
    cart: orderCart,
    subtotal,
    installmentMonths: installmentMonths as 3 | 6 | 12 | 24 | undefined,
    paymentFee,
    total: orderTotal,
    deliveryMinDays:
      ranges.length > 0 ? Math.max(...ranges.map((item) => item.availability.deliveryMinDays)) : 0,
    deliveryMaxDays:
      ranges.length > 0 ? Math.max(...ranges.map((item) => item.availability.deliveryMaxDays)) : 0,
    status: "pending_human_approval",
    createdAt: new Date().toISOString(),
  };
  await db.insert(orderProposals).values({
    id: proposal.id,
    userId,
    proposalJson: JSON.stringify(proposal),
    status: proposal.status,
    createdAt: proposal.createdAt,
  });
  return {
    success: true as const,
    proposal,
    message: "Order proposal prepared. Human approval is required.",
  };
}

export async function decideUserProposal(
  userId: string,
  proposalId: string,
  decision: "approve" | "reject" | "request_changes",
) {
  const [row] = await db
    .select({
      proposalJson: orderProposals.proposalJson,
      status: orderProposals.status,
      approvalToken: orderProposals.approvalToken,
    })
    .from(orderProposals)
    .where(and(eq(orderProposals.id, proposalId), eq(orderProposals.userId, userId)));
  if (!row || row.status !== "pending_human_approval")
    return {
      success: false as const,
      error: { code: "PROPOSAL_NOT_APPROVABLE", message: "This proposal cannot be approved." },
    };
  const proposal = JSON.parse(row.proposalJson) as OrderProposal;
  const status =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  const approvalToken = decision === "approve" ? `approval-${crypto.randomUUID()}` : undefined;
  const updated: OrderProposal = { ...proposal, status, approvalToken };
  await db
    .update(orderProposals)
    .set({
      proposalJson: JSON.stringify(updated),
      status,
      approvalToken: approvalToken ?? null,
    })
    .where(and(eq(orderProposals.id, proposalId), eq(orderProposals.userId, userId)));
  return { success: true as const, proposal: updated };
}

export async function placeUserOrder(userId: string, proposalId: string) {
  const [row] = await db
    .select({
      proposalJson: orderProposals.proposalJson,
      status: orderProposals.status,
      approvalToken: orderProposals.approvalToken,
    })
    .from(orderProposals)
    .where(and(eq(orderProposals.id, proposalId), eq(orderProposals.userId, userId)));
  if (!row)
    return {
      success: false as const,
      error: { code: "PROPOSAL_NOT_FOUND", message: `No proposal exists with ID ${proposalId}.` },
    };
  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.proposalId, proposalId), eq(orders.userId, userId)));
  if (existing)
    return {
      success: false as const,
      error: {
        code: "ORDER_ALREADY_PLACED",
        message: `This proposal already created order ${existing.id}.`,
        orderId: existing.id,
      },
    };
  if (row.status !== "approved" || !row.approvalToken)
    return {
      success: false as const,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "Human approval is required before placing this order.",
      },
    };
  const proposal = JSON.parse(row.proposalJson) as OrderProposal;
  const order: Order = {
    id: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    proposalId,
    items: proposal.cart.items,
    subtotal: proposal.subtotal,
    installmentMonths: proposal.installmentMonths,
    paymentFee: proposal.paymentFee,
    total: proposal.total,
    status: "placed",
    createdAt: new Date().toISOString(),
  };
  const orderedIds = new Set(proposal.cart.items.map((i) => i.product.id));
  const current = await getUserCart(userId);
  const remaining = Object.fromEntries(
    current.items
      .filter((i) => !orderedIds.has(i.product.id))
      .map((i) => [i.product.id, i.quantity]),
  );
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: order.id,
      userId,
      proposalId,
      orderJson: JSON.stringify(order),
      createdAt: order.createdAt,
    });
    await tx
      .update(carts)
      .set({ quantitiesJson: JSON.stringify(remaining), updatedAt: new Date().toISOString() })
      .where(eq(carts.userId, userId));
  });
  return { success: true as const, order, message: `Order ${order.id} placed.` };
}

export async function listUserOrders(userId: string): Promise<Order[]> {
  const rows = await db
    .select({ orderJson: orders.orderJson })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
  return rows.map((row) => JSON.parse(row.orderJson) as Order);
}

export async function getUserBudget(userId: string) {
  const [row] = await db
    .select({ limitAmount: budgets.limitAmount })
    .from(budgets)
    .where(eq(budgets.userId, userId));
  const limit = row ? Number(row.limitAmount) : 0;
  const allOrders = await listUserOrders(userId);
  const spent = allOrders
    .filter((o) => o.status === "placed")
    .reduce((sum, o) => sum + o.total, 0);
  return {
    limit: Number(limit.toFixed(2)),
    spent: Number(spent.toFixed(2)),
    remaining: Number((limit - spent).toFixed(2)),
    hasLimit: limit > 0,
  };
}

export async function setUserBudget(userId: string, amount: number) {
  const updatedAt = new Date().toISOString();
  const [existing] = await db
    .select({ userId: budgets.userId })
    .from(budgets)
    .where(eq(budgets.userId, userId));
  if (existing) {
    await db
      .update(budgets)
      .set({ limitAmount: String(amount), updatedAt })
      .where(eq(budgets.userId, userId));
  } else {
    await db.insert(budgets).values({ userId, limitAmount: String(amount), updatedAt });
  }
  return getUserBudget(userId);
}

export async function cancelUserOrder(userId: string, orderId: string) {
  const [row] = await db
    .select({ orderJson: orders.orderJson })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!row)
    return {
      success: false as const,
      error: { code: "ORDER_NOT_FOUND", message: `No order exists with ID ${orderId}.` },
    };
  const order = JSON.parse(row.orderJson) as Order;
  if (order.status === "cancelled")
    return {
      success: false as const,
      error: { code: "ORDER_ALREADY_CANCELLED", message: `Order ${orderId} is already cancelled.` },
    };
  const updated: Order = { ...order, status: "cancelled" };
  await db
    .update(orders)
    .set({ orderJson: JSON.stringify(updated) })
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  return { success: true as const, order: updated, message: `Order ${orderId} cancelled.` };
}

export async function getUserOrder(userId: string, orderId: string) {
  const [row] = await db
    .select({ orderJson: orders.orderJson })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  return row
    ? { success: true as const, order: JSON.parse(row.orderJson) as Order }
    : {
        success: false as const,
        error: { code: "ORDER_NOT_FOUND", message: `No order exists with ID ${orderId}.` },
      };
}
