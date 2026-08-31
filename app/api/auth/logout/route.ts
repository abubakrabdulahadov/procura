import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/server/auth";
export async function POST() { await deleteSession(); return NextResponse.json({ success: true }); }
