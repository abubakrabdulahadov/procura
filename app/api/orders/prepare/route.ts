import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { prepareUserOrder } from "@/lib/server/procurement";
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to prepare an order." } },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as { installmentMonths?: number; productIds?: string[]; source?: "user" | "agent" };
  const result = await prepareUserOrder(user.id, body.installmentMonths, body.productIds, body.source);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
