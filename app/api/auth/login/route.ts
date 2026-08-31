import { NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/server/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const user = await authenticateUser(body?.username ?? "", body?.password ?? "");
  if (!user)
    return NextResponse.json(
      { success: false, error: "Invalid username or password." },
      { status: 401 },
    );
  await createSession(user.id);
  return NextResponse.json({ success: true, user });
}
