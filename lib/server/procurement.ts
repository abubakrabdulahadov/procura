import { products } from "@/lib/data/mock";
import { checkProductAvailability } from "@/lib/procurement/product-intelligence";
import { getDatabase } from "@/lib/server/database";
import type { Cart, Order, OrderProposal } from "@/types/procurement";

interface CartRow {
  quantities_json: string;
  updated_at: string;
}
interface ProposalRow {
  proposal_json: string;
  status: OrderProposal["status"];
  approval_token?: string;
}
interface OrderRow {
  order_json: string;
}

function cartSnapshot(row: CartRow): Cart {
  const quantities = JSON.parse(row.quantities_json) as Record<string, number>;
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
    updatedAt: row.updated_at,
  };
}

export function getUserCart(userId: string): Cart {
  const database = getDatabase();
  let row = database
    .prepare("SELECT quantities_json, updated_at FROM carts WHERE user_id = ?")
    .get(userId) as CartRow | undefined;
  if (!row) {
    database
      .prepare("INSERT INTO carts (user_id, quantities_json, updated_at) VALUES (?, '{}', ?)")
      .run(userId, new Date(0).toISOString());
    row = { quantities_json: "{}", updated_at: new Date(0).toISOString() };
  }
  return cartSnapshot(row);
}

export function mutateUserCart(
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
  const current = getUserCart(userId);
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
  getDatabase()
    .prepare("UPDATE carts SET quantities_json = ?, updated_at = ? WHERE user_id = ?")
    .run(JSON.stringify(quantities), updatedAt, userId);
  const cart = getUserCart(userId);
  const message =
    action === "add"
      ? `${quantity} × ${product.name} added to cart.`
      : action === "update"
        ? `Cart quantity updated to ${quantity}.`
        : `${product.name} removed from cart.`;
  return { success: true as const, cart, message };
}

export function prepareUserOrder(userId: string, installmentMonths?: number) {
  const cart = getUserCart(userId);
  if (!cart.items.length)
    return {
      success: false as const,
      error: { code: "EMPTY_CART", message: "Add at least one product before preparing an order." },
    };
  if (installmentMonths !== undefined && ![3, 6, 12, 24].includes(installmentMonths))
    return {
      success: false as const,
      error: {
        code: "INVALID_INSTALLMENT_TERM",
        message: "installmentMonths must be 3, 6, 12, or 24.",
      },
    };
  const rate = installmentMonths === 12 ? 0.04 : installmentMonths === 24 ? 0.09 : 0;
  const paymentFee = Number((cart.subtotal * rate).toFixed(2));
  const ranges = cart.items
    .map((item) => checkProductAvailability(item.product.id, item.quantity))
    .filter((item) => item.success);
  const proposal: OrderProposal = {
    id: `proposal-${crypto.randomUUID()}`,
    cart,
    subtotal: cart.subtotal,
    installmentMonths: installmentMonths as 3 | 6 | 12 | 24 | undefined,
    paymentFee,
    total: Number((cart.subtotal + paymentFee).toFixed(2)),
    deliveryMinDays: Math.max(...ranges.map((item) => item.availability.deliveryMinDays)),
    deliveryMaxDays: Math.max(...ranges.map((item) => item.availability.deliveryMaxDays)),
    status: "pending_human_approval",
    createdAt: new Date().toISOString(),
  };
  getDatabase()
    .prepare(
      "INSERT INTO order_proposals (id, user_id, proposal_json, status, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(proposal.id, userId, JSON.stringify(proposal), proposal.status, proposal.createdAt);
  return {
    success: true as const,
    proposal,
    message: "Order proposal prepared. Human approval is required.",
  };
}

export function decideUserProposal(
  userId: string,
  proposalId: string,
  decision: "approve" | "reject" | "request_changes",
) {
  const row = getDatabase()
    .prepare(
      "SELECT proposal_json, status, approval_token FROM order_proposals WHERE id = ? AND user_id = ?",
    )
    .get(proposalId, userId) as ProposalRow | undefined;
  if (!row || row.status !== "pending_human_approval")
    return {
      success: false as const,
      error: { code: "PROPOSAL_NOT_APPROVABLE", message: "This proposal cannot be approved." },
    };
  const proposal = JSON.parse(row.proposal_json) as OrderProposal;
  const status =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  const approvalToken = decision === "approve" ? `approval-${crypto.randomUUID()}` : undefined;
  const updated: OrderProposal = { ...proposal, status, approvalToken };
  getDatabase()
    .prepare(
      "UPDATE order_proposals SET proposal_json = ?, status = ?, approval_token = ? WHERE id = ? AND user_id = ?",
    )
    .run(JSON.stringify(updated), status, approvalToken ?? null, proposalId, userId);
  return { success: true as const, proposal: updated };
}

export function placeUserOrder(userId: string, proposalId: string) {
  const database = getDatabase();
  const row = database
    .prepare(
      "SELECT proposal_json, status, approval_token FROM order_proposals WHERE id = ? AND user_id = ?",
    )
    .get(proposalId, userId) as ProposalRow | undefined;
  if (!row)
    return {
      success: false as const,
      error: { code: "PROPOSAL_NOT_FOUND", message: `No proposal exists with ID ${proposalId}.` },
    };
  const existing = database
    .prepare("SELECT id FROM orders WHERE proposal_id = ? AND user_id = ?")
    .get(proposalId, userId) as { id: string } | undefined;
  if (existing)
    return {
      success: false as const,
      error: {
        code: "ORDER_ALREADY_PLACED",
        message: `This proposal already created order ${existing.id}.`,
        orderId: existing.id,
      },
    };
  if (row.status !== "approved" || !row.approval_token)
    return {
      success: false as const,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "Human approval is required before placing this order.",
      },
    };
  const proposal = JSON.parse(row.proposal_json) as OrderProposal;
  const current = getUserCart(userId);
  if (current.updatedAt !== proposal.cart.updatedAt || current.subtotal !== proposal.cart.subtotal)
    return {
      success: false as const,
      error: {
        code: "CART_CHANGED_AFTER_APPROVAL",
        message: "The cart changed after approval. Prepare a new proposal.",
      },
    };
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
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "INSERT INTO orders (id, user_id, proposal_id, order_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(order.id, userId, proposalId, JSON.stringify(order), order.createdAt);
    database
      .prepare("UPDATE carts SET quantities_json = '{}', updated_at = ? WHERE user_id = ?")
      .run(new Date().toISOString(), userId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { success: true as const, order, message: `Order ${order.id} placed.` };
}

export function listUserOrders(userId: string): Order[] {
  return (
    getDatabase()
      .prepare("SELECT order_json FROM orders WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as OrderRow[]
  ).map((row) => JSON.parse(row.order_json) as Order);
}
export function getUserOrder(userId: string, orderId: string) {
  const row = getDatabase()
    .prepare("SELECT order_json FROM orders WHERE id = ? AND user_id = ?")
    .get(orderId, userId) as OrderRow | undefined;
  return row
    ? { success: true as const, order: JSON.parse(row.order_json) as Order }
    : {
        success: false as const,
        error: { code: "ORDER_NOT_FOUND", message: `No order exists with ID ${orderId}.` },
      };
}
