import type { AuthConfig } from "convex/server";

// The fleet's shared Clerk dev instance. Every Convex project in this repo
// points at it (memes, buyhacks, gamebin, guild-hall, character-sheet,
// neorgon-auth-client), and the publishable key that pairs with it is public
// by design (C7.7). The JWT template is named "convex".
const CLERK_JWT_ISSUER = "https://liked-pup-17.clerk.accounts.dev";

export default {
  providers: [
    {
      domain: CLERK_JWT_ISSUER,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
