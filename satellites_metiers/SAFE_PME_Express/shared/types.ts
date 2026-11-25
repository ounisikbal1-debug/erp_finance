import type { UserRole } from "./constants";

// The identity contract every AuthProvider yields (DESIGN Â§5.1). Business code
// depends ONLY on this shape â€” never on HOW the user authenticated â€” which is
// what makes auth pluggable (local today, SSO later) with zero business-code
// churn. NOTE: no password_hash / provider-internal fields here on purpose.
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}
