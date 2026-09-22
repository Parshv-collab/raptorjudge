/// <reference types="vite/client" />

export default {
  providers: [
    {
      // Matches the @convex-dev/auth jwtIssuer registered in convex.config.ts
      domain: process.env.CONVEX_SITE_URL ?? "",
      applicationID: "convex",
    },
  ],
};
