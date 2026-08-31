import { NextResponse } from "next/server";
import { createSession, createUser } from "@/lib/server/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    firstName?: string;
    lastName?: string;
    username?: string;
    password?: string;
  } | null;
  const firstName = body?.firstName?.trim() ?? "";
  const lastName = body?.lastName?.trim() ?? "";
  const username = body?.username?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  if (firstName.length < 2 || firstName.length > 50 || lastName.length < 2 || lastName.length > 50)
    return NextResponse.json(
      { success: false, error: "First and last name must be 2–50 characters." },
      { status: 400 },
    );
  if (!/^[a-z0-9_]{3,24}$/.test(username))
    return NextResponse.json(
      {
        success: false,
        error: "Username must be 3–24 lowercase letters, numbers, or underscores.",
      },
      { status: 400 },
    );
  if (password.length < 8 || password.length > 128)
    return NextResponse.json(
      { success: false, error: "Password must be 8–128 characters." },
      { status: 400 },
    );
  const result = await createUser({ firstName, lastName, username, password });
  if (!result.success) return NextResponse.json(result, { status: 409 });
  await createSession(result.user.id);
  return NextResponse.json({ success: true, user: result.user }, { status: 201 });
}
