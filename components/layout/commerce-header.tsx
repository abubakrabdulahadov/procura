"use client";

import Link from "next/link";
import { LogOut, ReceiptText, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/types/auth";

export function CommerceHeader({
  cartCount,
  orderCount,
}: {
  cartCount: number;
  orderCount: number;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => {
    void fetch("/api/auth/session")
      .then((response) => response.json())
      .then((result) => setUser(result.user))
      .catch(() => setUser(null));
  }, []);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : "";
  return (
    <header className="commerce-topbar">
      <Link className="commerce-brandmark" href="/" aria-label="Procura home">
        <span className="brand-mark">P</span>
        <strong>Procura</strong>
      </Link>
      <div className="commerce-topbar-actions">
        <Link
          className="cart-trigger"
          href="/cart"
          aria-label={`Open cart with ${cartCount} items`}
        >
          <ShoppingCart aria-hidden="true" />
          <span>Cart</span>
          {cartCount > 0 && <b>{cartCount}</b>}
        </Link>
        <Link
          className="orders-trigger"
          href="/orders"
          aria-label={`Open orders with ${orderCount} orders`}
        >
          <ReceiptText aria-hidden="true" />
          <span>Orders</span>
          {orderCount > 0 && <b>{orderCount}</b>}
        </Link>
        {user === undefined ? (
          <div className="commerce-account account-loading" aria-label="Loading account" />
        ) : user ? (
          <div className="commerce-account" aria-label="Signed in account">
            <span className="avatar">{initials}</span>
            <span className="account-copy">
              <strong>
                {user.firstName} {user.lastName}
              </strong>
              <small>@{user.username}</small>
            </span>
            <button className="account-logout" onClick={logout} aria-label="Sign out">
              <LogOut />
            </button>
          </div>
        ) : (
          <div className="auth-links">
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
          </div>
        )}
      </div>
    </header>
  );
}
