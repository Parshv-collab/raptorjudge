import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth setup (T1: Auth & sessions).
 *
 * Credentials auth with hashed passwords, fully offline: no external identity
 * provider is contacted at any point. Sessions are local JWTs issued by the
 * Convex JWT issuer configured in convex.config.ts + auth.config.ts.
 */
export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      profile(params: Record<string, unknown>) {
        return {
          name:
            (params.name as string) ??
            ((params.email as string)?.split("@")[0] ?? "User"),
          email: params.email as string,
        };
      },
    }),
  ],
});
