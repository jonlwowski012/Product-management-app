import { betaEnabled } from "./beta-config";

export function isBetaAdmin(
  user: {
    id: string;
    email: string;
    is_demo: boolean;
    deletion_requested_at: Date | null;
  } | null,
) {
  return Boolean(
    betaEnabled() &&
    user &&
    !user.is_demo &&
    !user.deletion_requested_at &&
    user.email === "jonathan.lwowski@gmail.com" &&
    user.id === process.env.BETA_ADMIN_USER_ID,
  );
}
