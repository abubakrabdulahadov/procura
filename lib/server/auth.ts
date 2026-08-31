import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/server/database";
import { carts, users } from "@/lib/server/schema";
import type { SessionUser } from "@/types/auth";

const scrypt = promisify(scryptCallback);
const cookieName = "procura_session";
const sessionDays = 30;

function sessionSecret() {
  const value =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "procura-local-development-secret-change-me");
  if (!value) throw new Error("SESSION_SECRET is required in production.");
  return value;
}

type UserSelect = typeof users.$inferSelect;

function publicUser(user: UserSelect): SessionUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
  };
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export async function createUser(input: {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
}) {
  const username = normalizeUsername(input.username);
  const salt = randomBytes(16).toString("hex");
  const passwordHash = Buffer.from((await scrypt(input.password, salt, 64)) as Buffer).toString(
    "hex",
  );

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));
  if (existing) return { success: false as const, error: "This username is already taken." };

  const user: UserSelect = {
    id: `user-${crypto.randomUUID()}`,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    passwordHash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values(user);
      await tx.insert(carts).values({
        userId: user.id,
        quantitiesJson: "{}",
        updatedAt: new Date(0).toISOString(),
      });
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("unique"))
      return { success: false as const, error: "This username is already taken." };
    throw error;
  }

  return { success: true as const, user: publicUser(user) };
}

export async function authenticateUser(usernameInput: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, normalizeUsername(usernameInput)));
  if (!user) return null;
  const candidate = Buffer.from((await scrypt(password, user.passwordSalt, 64)) as Buffer);
  const expected = Buffer.from(user.passwordHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
    ? publicUser(user)
    : null;
}

function encodeSession(userId: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(token?: string): { userId: string; expiresAt: number } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      expiresAt: number;
    };
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const expiresAt = Date.now() + sessionDays * 24 * 60 * 60 * 1000;
  (await cookies()).set(cookieName, encodeSession(userId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function deleteSession() {
  (await cookies()).delete(cookieName);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = decodeSession((await cookies()).get(cookieName)?.value);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  return user ? publicUser(user) : null;
}
