import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';

const handler = NextAuth({
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
        // Store Discord info in token
        token.discordId = profile.id;
        token.accessToken = account.access_token;
        
        // Check if user is in your Discord server
        try {
          const guildId = process.env.DISCORD_GUILD_ID!;
          
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
            const isInGuild = guilds.some((guild: any) => guild.id === guildId);
            token.hasAccess = isInGuild;
          } else {
            token.hasAccess = false;
          }
        } catch (error) {
          console.error('Error checking Discord guilds:', error);
          token.hasAccess = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Pass role info to session
      session.user.discordId = token.discordId;
      session.user.hasAccess = token.hasAccess;
      session.user.discordRoles = token.discordRoles;
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