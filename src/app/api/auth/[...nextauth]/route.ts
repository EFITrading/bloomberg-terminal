import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';

const handler = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds guilds.members.read'
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // DEBUG: log every JWT callback invocation
      console.log('🟡 [JWT] called - has account:', !!account, '| tokenVersion:', (token as any).tokenVersion, '| hasAccess:', token.hasAccess);

      // Force re-auth if token was issued before role-check was added (only for existing sessions, not fresh logins)
      if (!account && (token as any).tokenVersion !== 2) {
        console.log('🔴 [JWT] Old/missing tokenVersion - clearing token to force re-login');
        return {} as any;
      }

      if (account && profile) {
        console.log('🔵 [JWT] New login - profile id:', profile.id);
        console.log('🔵 [JWT] account.access_token present:', !!account.access_token);
        console.log('🔵 [JWT] scopes granted:', account.scope);
        token.discordId = profile.id;
        token.accessToken = account.access_token;
        (token as any).tokenVersion = 2;

        const guildId = process.env.DISCORD_GUILD_ID;
        const requiredRoleId = process.env.DISCORD_REQUIRED_ROLE_ID;
        console.log('🔍 [JWT] DISCORD_GUILD_ID:', guildId ?? 'MISSING');
        console.log('🔍 [JWT] DISCORD_REQUIRED_ROLE_ID:', requiredRoleId ?? 'MISSING');

        if (!guildId || !requiredRoleId) {
          console.error('❌ [JWT] Missing env vars - denying access');
          token.hasAccess = false;
          return token;
        }

        try {
          const memberUrl = `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`;
          console.log('🔍 [JWT] Fetching:', memberUrl);

          const memberResponse = await fetch(memberUrl, {
            headers: { Authorization: `Bearer ${account.access_token}` }
          });

          console.log('🔍 [JWT] Discord API response status:', memberResponse.status);

          if (memberResponse.ok) {
            const member = await memberResponse.json();
            const roles: string[] = member.roles ?? [];
            console.log('✅ [JWT] User roles:', JSON.stringify(roles));
            console.log('✅ [JWT] Looking for role:', requiredRoleId);
            const hasRole = roles.includes(requiredRoleId);
            console.log('🎯 [JWT] hasRole:', hasRole);
            token.hasAccess = hasRole;
          } else {
            const body = await memberResponse.text();
            console.error('❌ [JWT] Discord API error body:', body);
            token.hasAccess = false;
          }
        } catch (error) {
          console.error('❌ [JWT] Exception:', error);
          token.hasAccess = false;
        }
      }

      console.log('🟡 [JWT] returning token - hasAccess:', token.hasAccess);
      return token;
    },
    async session({ session, token }) {
      console.log('🔵 [SESSION] hasAccess:', token.hasAccess, '| tokenVersion:', (token as any).tokenVersion);
      (session as any).user.discordId = token.discordId;
      (session as any).hasAccess = token.hasAccess;
      (session as any).user.discordRoles = token.discordRoles;
      return session;
    },
    async signIn({ user, account, profile }) {
      return true;
    },
    async redirect({ url, baseUrl }) {
      // After sign-in, check will happen in middleware via hasAccess token
      // If they land on baseUrl, send them home and middleware handles the rest
      if (url === baseUrl || url === `${baseUrl}/`) return baseUrl;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  }
});

export { handler as GET, handler as POST };