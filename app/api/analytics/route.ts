import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { listUserOrders, getUserBudget } from "@/lib/server/procurement";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to view analytics." } },
      { status: 401 },
    );

  const orders = await listUserOrders(user.id);
  const budget = await getUserBudget(user.id);
  const active = orders.filter((o) => o.status === "placed");
  const cancelled = orders.filter((o) => o.status === "cancelled");

  const categorySpend: Record<string, { amount: number; items: number }> = {};
  for (const order of active) {
    for (const item of order.items) {
      const cat = item.product.category;
      if (!categorySpend[cat]) categorySpend[cat] = { amount: 0, items: 0 };
      categorySpend[cat].amount = Number((categorySpend[cat].amount + item.lineTotal).toFixed(2));
      categorySpend[cat].items += item.quantity;
    }
  }

  const totalSpent = active.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = active.length > 0 ? Number((totalSpent / active.length).toFixed(2)) : 0;
  const totalItems = active.reduce((s, o) => o.items.reduce((acc, i) => acc + i.quantity, s), 0);

  const topCategory = Object.entries(categorySpend).sort((a, b) => b[1].amount - a[1].amount)[0];

  return NextResponse.json({
    success: true,
    analytics: {
      totalOrders: active.length,
      cancelledOrders: cancelled.length,
      totalSpent: Number(totalSpent.toFixed(2)),
      totalItems,
      avgOrderValue,
      categoryBreakdown: categorySpend,
      topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1].amount } : null,
      budget: {
        hasLimit: budget.hasLimit,
        limit: budget.limit,
        spent: budget.spent,
        remaining: budget.remaining,
        utilizationPercent: budget.hasLimit
          ? Number(((budget.spent / budget.limit) * 100).toFixed(1))
          : null,
      },
    },
  });
}
