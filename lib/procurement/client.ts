import type { Cart, Order, OrderProposal } from "@/types/procurement";

export const emptyCart: Cart = {
  id: "cart-active",
  items: [],
  itemCount: 0,
  subtotal: 0,
  updatedAt: new Date(0).toISOString(),
};
async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({
    success: false,
    error: { code: "PARSE_ERROR", message: "Server returned an invalid response." },
  }));
  return { response, data };
}
export async function fetchCart() {
  return (await jsonRequest("/api/cart")).data as {
    success: boolean;
    cart?: Cart;
    error?: { code: string; message: string };
  };
}
export async function mutateCart(
  action: "add" | "update" | "remove",
  productId: string,
  quantity?: number,
) {
  return (
    await jsonRequest("/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, productId, quantity }),
    })
  ).data as {
    success: boolean;
    cart?: Cart;
    message?: string;
    error?: { code: string; message: string };
  };
}
export async function prepareOrderRequest(installmentMonths?: number) {
  return (
    await jsonRequest("/api/orders/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installmentMonths }),
    })
  ).data as {
    success: boolean;
    proposal?: OrderProposal;
    error?: { code: string; message: string };
  };
}
export async function decideOrderRequest(
  proposalId: string,
  decision: "approve" | "reject" | "request_changes",
) {
  return (
    await jsonRequest("/api/orders/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId, decision }),
    })
  ).data as {
    success: boolean;
    proposal?: OrderProposal;
    error?: { code: string; message: string };
  };
}
export async function approveOrderRequest(proposalId: string) {
  return decideOrderRequest(proposalId, "approve");
}
export async function placeOrderRequest(proposalId: string) {
  return (
    await jsonRequest("/api/orders/place", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId }),
    })
  ).data as {
    success: boolean;
    order?: Order;
    message?: string;
    error?: { code: string; message: string; orderId?: string };
  };
}
export async function cancelOrderRequest(orderId: string) {
  return (
    await jsonRequest("/api/orders/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
  ).data as {
    success: boolean;
    order?: Order;
    message?: string;
    error?: { code: string; message: string };
  };
}
export async function fetchOrders() {
  return (await jsonRequest("/api/orders")).data as {
    success: boolean;
    orders?: Order[];
    count?: number;
    error?: { code: string; message: string };
  };
}
export async function fetchOrder(orderId: string) {
  return (await jsonRequest(`/api/orders/${encodeURIComponent(orderId)}`)).data as {
    success: boolean;
    order?: Order;
    error?: { code: string; message: string };
  };
}
export interface Budget {
  limit: number;
  spent: number;
  remaining: number;
  hasLimit: boolean;
}
export async function fetchBudget() {
  return (await jsonRequest("/api/budget")).data as {
    success: boolean;
    budget?: Budget;
    error?: { code: string; message: string };
  };
}
export async function setBudgetRequest(limit: number) {
  return (
    await jsonRequest("/api/budget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit }),
    })
  ).data as {
    success: boolean;
    budget?: Budget;
    message?: string;
    error?: { code: string; message: string };
  };
}
