import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { getUserOrder } from "@/lib/server/procurement";
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      {
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Sign in to access this order." },
      },
      { status: 401 },
    );
  const { orderId } = await params;
  const result = await getUserOrder(user.id, orderId);
  return NextResponse.json(result, { status: result.success ? 200 : 404 });
}
