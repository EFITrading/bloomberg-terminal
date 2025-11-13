// types/next-auth.d.ts
import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      discordId?: string;
      hasAccess?: boolean;
      discordRoles?: string[];
    };
  }

  interface JWT {
    discordId?: string;
    hasAccess?: boolean;
    discordRoles?: string[];
    accessToken?: string;
  }

  interface Profile {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
    email?: string;
  }
}