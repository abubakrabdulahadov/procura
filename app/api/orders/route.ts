import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { listUserOrders } from "@/lib/server/procurement";
export async function GET() { const user = await getSessionUser(); if (!user) return NextResponse.json({ success: false, error: { code: "AUTH_REQUIRED", message: "Sign in to access your orders." } }, { status: 401 }); const orders = listUserOrders(user.id); return NextResponse.json({ success: true, orders, count: orders.length }); }
