import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/server/database";
import type { SessionUser } from "@/types/auth";

const scrypt = promisify(scryptCallback);
const cookieName = "procura_session";
const sessionDays = 30;

function sessionSecret() {
  const value = process.env.SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "procura-local-development-secret-change-me");
  if (!value) throw new Error("SESSION_SECRET is required in production.");
  return value;
}

interface UserRow { id: string; first_name: string; last_name: string; username: string; password_hash: string; password_salt: string; created_at: string }
function publicUser(user: UserRow): SessionUser { return { id: user.id, firstName: user.first_name, lastName: user.last_name, username: user.username }; }
function normalizeUsername(value: string) { return value.trim().toLowerCase(); }

export async function createUser(input: { firstName: string; lastName: string; username: string; password: string }) {
  const username = normalizeUsername(input.username);
  const salt = randomBytes(16).toString("hex");
  const passwordHash = Buffer.from(await scrypt(input.password, salt, 64) as Buffer).toString("hex");
  const database = getDatabase();
  if (database.prepare("SELECT id FROM users WHERE username = ?").get(username)) return { success: false as const, error: "This username is already taken." };
  const user: UserRow = { id: `user-${crypto.randomUUID()}`, first_name: input.firstName.trim(), last_name: input.lastName.trim(), username, password_hash: passwordHash, password_salt: salt, created_at: new Date().toISOString() };
  database.exec("BEGIN IMMEDIATE");
  try { database.prepare("INSERT INTO users (id, first_name, last_name, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(user.id, user.first_name, user.last_name, user.username, user.password_hash, user.password_salt, user.created_at); database.prepare("INSERT INTO carts (user_id, quantities_json, updated_at) VALUES (?, '{}', ?)").run(user.id, new Date(0).toISOString()); database.exec("COMMIT"); }
  catch (error) { database.exec("ROLLBACK"); throw error; }
  return { success: true as const, user: publicUser(user) };
}

export async function authenticateUser(usernameInput: string, password: string) {
  const user = getDatabase().prepare("SELECT * FROM users WHERE username = ?").get(normalizeUsername(usernameInput)) as UserRow | undefined;
  if (!user) return null;
  const candidate = Buffer.from(await scrypt(password, user.password_salt, 64) as Buffer);
  const expected = Buffer.from(user.password_hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected) ? publicUser(user) : null;
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
  try { const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string; expiresAt: number }; return session.expiresAt > Date.now() ? session : null; } catch { return null; }
}

export async function createSession(userId: string) {
  const expiresAt = Date.now() + sessionDays * 24 * 60 * 60 * 1000;
  (await cookies()).set(cookieName, encodeSession(userId, expiresAt), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
}

export async function deleteSession() { (await cookies()).delete(cookieName); }

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = decodeSession((await cookies()).get(cookieName)?.value);
  if (!session) return null;
  const user = getDatabase().prepare("SELECT * FROM users WHERE id = ?").get(session.userId) as UserRow | undefined;
  return user ? publicUser(user) : null;
}
