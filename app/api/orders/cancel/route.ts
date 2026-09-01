import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { cancelUserOrder } from "@/lib/server/procurement";
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to cancel an order." } },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    source?: "user" | "agent";
  };
  if (!body.orderId)
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: "orderId is required." } },
      { status: 400 },
    );
  const result = await cancelUserOrder(user.id, body.orderId, body.source);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
