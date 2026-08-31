"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = new FormData(event.currentTarget);
      const payload = Object.fromEntries(data.entries());
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) return setError(result?.error ?? "Authentication failed.");
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/">
          <span className="brand-mark">P</span>
          <strong>Procura</strong>
        </Link>
        <div className="auth-heading">
          <span>{mode === "signup" ? "Create your account" : "Welcome back"}</span>
          <h1>{mode === "signup" ? "Start purchasing" : "Sign in"}</h1>
          <p>
            {mode === "signup"
              ? "No email or verification required."
              : "Use your username and password."}
          </p>
        </div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <div className="auth-name-grid">
              <label>
                <span>First name</span>
                <input
                  name="firstName"
                  autoComplete="given-name"
                  minLength={2}
                  maxLength={50}
                  required
                />
              </label>
              <label>
                <span>Last name</span>
                <input
                  name="lastName"
                  autoComplete="family-name"
                  minLength={2}
                  maxLength={50}
                  required
                />
              </label>
            </div>
          )}
          <label>
            <span>Username</span>
            <div>
              <UserRound />
              <input
                name="username"
                autoComplete="username"
                pattern="[a-zA-Z0-9_]{3,24}"
                minLength={3}
                maxLength={24}
                required
              />
            </div>
          </label>
          <label>
            <span>Password</span>
            <div>
              <LockKeyhole />
              <input
                name="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                maxLength={128}
                required
              />
            </div>
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={pending}>
            {pending ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            <ArrowRight />
          </button>
        </form>
        <footer>
          {mode === "signup" ? "Already have an account?" : "New to Procura?"}{" "}
          <Link href={mode === "signup" ? "/login" : "/signup"}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </Link>
        </footer>
      </section>
    </main>
  );
}
