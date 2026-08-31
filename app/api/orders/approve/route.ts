import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { decideUserProposal } from "@/lib/server/procurement";
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      {
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Sign in to decide an order proposal." },
      },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    proposalId?: string;
    decision?: "approve" | "reject" | "request_changes";
  };
  const decision = body.decision ?? "approve";
  if (!body.proposalId || !["approve", "reject", "request_changes"].includes(decision))
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_INPUT", message: "proposalId and a valid decision are required." },
      },
      { status: 400 },
    );
  const result = decideUserProposal(user.id, body.proposalId, decision);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
