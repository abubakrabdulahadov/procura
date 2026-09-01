import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { getUserCart, mutateUserCart } from "@/lib/server/procurement";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to access your cart." } },
      { status: 401 },
    );
  return NextResponse.json({ success: true, cart: await getUserCart(user.id) });
}
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to change your cart." } },
      { status: 401 },
    );
  const body = (await request.json().catch(() => null)) as {
    action?: "add" | "update" | "remove";
    productId?: string;
    quantity?: number;
    source?: "user" | "agent";
  } | null;
  if (!body?.action || !body.productId || !["add", "update", "remove"].includes(body.action))
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_INPUT", message: "Provide action and productId." },
      },
      { status: 400 },
    );
  const result = await mutateUserCart(user.id, body.action, body.productId, body.quantity, body.source);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
