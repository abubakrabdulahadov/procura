import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { placeUserOrder } from "@/lib/server/procurement";
export async function POST(request: Request) { const user = await getSessionUser(); if (!user) return NextResponse.json({ success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to place an order." } }, { status: 401 }); const body = await request.json().catch(() => ({})) as { proposalId?: string }; if (!body.proposalId) return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "proposalId is required." } }, { status: 400 }); const result = placeUserOrder(user.id, body.proposalId); return NextResponse.json(result, { status: result.success ? 200 : 400 }); }
