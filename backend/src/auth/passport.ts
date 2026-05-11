import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { authConfig, isDiscordUserAllowed } from './config';

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  email?: string;
  accessToken: string;
  refreshToken: string;
  guilds?: any[];
  isAuthorized: boolean;
}

export function configurePassport(): void {
  passport.serializeUser((user: any, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done) => {
    done(null, user);
  });

  passport.use(
    new DiscordStrategy(
      {
        clientID: authConfig.discord.clientID,
        clientSecret: authConfig.discord.clientSecret,
        callbackURL: authConfig.discord.callbackURL,
        scope: authConfig.discord.scope
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          if (!isDiscordUserAllowed(profile.id)) {
            console.warn(
              `Unauthorized Discord login attempt blocked: ${profile.username} (ID: ${profile.id})`
            );
            return done(null, false, { code: 'discord_not_allowed' });
          }

          const user: DiscordUser = {
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            avatar: profile.avatar,
            email: profile.email,
            accessToken,
            refreshToken,
            isAuthorized: true
          };

          console.log(`Authenticated Discord user: ${profile.username} (ID: ${profile.id})`);
          return done(null, user);
        } catch (error) {
          console.error('Discord authentication error:', error);
          return done(error);
        }
      }
    )
  );
}
