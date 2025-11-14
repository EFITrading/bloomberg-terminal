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
          scope: 'identify guilds'
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        console.log('🔵 JWT Callback - New login detected');
        // Store Discord info in token
        token.discordId = profile.id;
        token.accessToken = account.access_token;
        
        // Check if user is in your Discord server
        try {
          const guildId = process.env.DISCORD_GUILD_ID!;
          console.log('🔍 Checking guild membership for guild:', guildId);
          
          // Get user's guilds
          const guildsResponse = await fetch(
            'https://discord.com/api/v10/users/@me/guilds',
            {
              headers: {
                Authorization: `Bearer ${account.access_token}`
              }
            }
          );
          
          if (guildsResponse.ok) {
            const guilds = await guildsResponse.json();
            console.log('✅ User guilds:', guilds.map((g: any) => g.id));
            const isInGuild = guilds.some((guild: any) => guild.id === guildId);
            console.log('🎯 Is in required guild?', isInGuild);
            token.hasAccess = isInGuild;
          } else {
            console.error('❌ Failed to fetch guilds:', guildsResponse.status);
            token.hasAccess = false;
          }
        } catch (error) {
          console.error('❌ Error checking Discord guilds:', error);
          token.hasAccess = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      console.log('🔵 Session callback - hasAccess:', token.hasAccess);
      // Pass role info to session
      (session as any).user.discordId = token.discordId;
      (session as any).hasAccess = token.hasAccess;
      (session as any).user.discordRoles = token.discordRoles;
      return session;
    },
    async signIn({ user, account, profile }) {
      // You can add additional sign-in logic here if needed
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  }
});

export { handler as GET, handler as POST };