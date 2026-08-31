export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
}

export interface AuthActionState {
  error?: string;
  fields?: { firstName?: string; lastName?: string; username?: string };
}
