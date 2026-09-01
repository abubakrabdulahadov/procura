import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { getUserProposal } from "@/lib/server/procurement";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      {
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Sign in to check this proposal." },
      },
      { status: 401 },
    );
  const { proposalId } = await params;
  const result = await getUserProposal(user.id, proposalId);
  return NextResponse.json(result, { status: result.success ? 200 : 404 });
}
