import type { SessionUser } from "@/types/auth";

export function webMCPUser(user: SessionUser) {
  return {
    name: `${user.firstName} ${user.lastName}`.trim(),
    username: user.username,
  };
}
