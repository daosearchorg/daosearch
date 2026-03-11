import "next-auth";
import "@auth/core/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      dbId: number;
      email: string;
      name: string;
      publicUsername: string;
      publicAvatarUrl: string | null;
      provider: string;
    };
  }

  interface User {
    dbId?: number;
    displayName?: string;
    publicUsername?: string;
    publicAvatarUrl?: string | null;
    provider?: string;
    providerId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    dbId?: number;
    displayName?: string;
    publicUsername?: string;
    publicAvatarUrl?: string | null;
    provider?: string;
  }
}
