import { AuthStorage } from "@/lib/auth-storage";

/**
 * Returns true if the current user has the 'viewer' role (demo/read-only mode).
 * Use this to conditionally hide action buttons in the UI.
 */
export function useIsViewer(): boolean {
  const user = AuthStorage.getUser();
  return user?.role === "viewer";
}
