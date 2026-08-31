import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { getUserBudget, setUserBudget } from "@/lib/server/procurement";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to view budget." } },
      { status: 401 },
    );
  const budget = await getUserBudget(user.id);
  return NextResponse.json({ success: true, budget });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to set budget." } },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  if (typeof body.limit !== "number" || body.limit < 0)
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "limit must be a non-negative number." } },
      { status: 400 },
    );
  const budget = await setUserBudget(user.id, body.limit);
  return NextResponse.json({ success: true, budget, message: `Budget set to $${body.limit.toFixed(2)}.` });
}
