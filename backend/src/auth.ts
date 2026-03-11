import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import { uniqueUsernameGenerator, adjectives, nouns } from "unique-username-generator";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import "@/types";

interface DbUser {
  id: number;
  email: string;
  displayName: string;
  publicUsername: string;
  publicAvatarUrl: string | null;
  provider: string;
  providerId: string;
}

function generateUsername(): string {
  return uniqueUsernameGenerator({
    dictionaries: [adjectives, nouns],
    separator: "",
    style: "pascalCase",
    randomDigits: 4,
    length: 30,
  });
}

async function findOrCreateUser(
  provider: string,
  providerId: string,
  email: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<DbUser> {
  // Single query: update last_login and return existing user
  const [existing] = await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.provider, provider), eq(users.providerId, providerId)))
    .returning();

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      displayName: existing.displayName,
      publicUsername: existing.publicUsername,
      publicAvatarUrl: existing.publicAvatarUrl,
      provider: existing.provider,
      providerId: existing.providerId,
    };
  }

  // Check if a user with this email already exists (e.g. signed up via different provider)
  if (email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (byEmail) {
      // Update to latest provider and bump last_login
      await db
        .update(users)
        .set({ provider, providerId, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, byEmail.id));

      return {
        id: byEmail.id,
        email: byEmail.email,
        displayName: byEmail.displayName,
        publicUsername: byEmail.publicUsername,
        publicAvatarUrl: byEmail.publicAvatarUrl,
        provider,
        providerId,
      };
    }
  }

  // New user: generate unique username with retry
  const now = new Date();
  let username = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateUsername();
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicUsername, candidate))
      .limit(1);

    if (!conflict) {
      username = candidate;
      break;
    }
  }

  if (!username) {
    username = `User${Date.now()}`;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      displayName,
      publicUsername: username,
      publicAvatarUrl: avatarUrl,
      provider,
      providerId,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    id: created.id,
    email: created.email,
    displayName: created.displayName,
    publicUsername: created.publicUsername,
    publicAvatarUrl: created.publicAvatarUrl,
    provider: created.provider,
    providerId: created.providerId,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  ],
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;

      const provider = account.provider;
      const providerId = account.providerAccountId;
      const email = user.email || (profile.email as string) || "";
      const displayName = user.name || (profile.name as string) || "";
      const avatarUrl = user.image || null;

      try {
        const dbUser = await findOrCreateUser(
          provider,
          providerId,
          email,
          displayName,
          avatarUrl,
        );

        user.dbId = dbUser.id;
        user.displayName = dbUser.displayName;
        user.publicUsername = dbUser.publicUsername;
        user.publicAvatarUrl = dbUser.publicAvatarUrl;
        user.provider = dbUser.provider;
        user.providerId = dbUser.providerId;

        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.dbId = user.dbId;
        token.email = user.email ?? "";
        token.displayName = user.displayName;
        token.publicUsername = user.publicUsername;
        token.publicAvatarUrl = user.publicAvatarUrl;
        token.provider = user.provider;
      }
      if (trigger === "update" && session) {
        if (session.publicUsername !== undefined) {
          token.publicUsername = session.publicUsername;
        }
        if (session.publicAvatarUrl !== undefined) {
          token.publicAvatarUrl = session.publicAvatarUrl;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.dbId = token.dbId ?? 0;
      session.user.email = token.email ?? "";
      session.user.name = token.displayName ?? "";
      session.user.publicUsername = token.publicUsername ?? "";
      session.user.publicAvatarUrl = token.publicAvatarUrl ?? null;
      session.user.provider = token.provider ?? "";
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});
