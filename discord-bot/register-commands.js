#!/usr/bin/env node
/**
 * One-time script to register slash commands with Discord.
 * Use this when running the bot via Firebase Functions (no persistent Node instance).
 *
 * Run: node register-commands.js
 * Requires: .env with DISCORD_TOKEN, DISCORD_CLIENT_ID (optional: DISCORD_GUILD_ID)
 */
import { config } from 'dotenv';
import { REST, Routes } from 'discord.js';
import { commands } from './commandDefinitions.js';

config();

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      console.log(`Cleared guild commands for ${guildId}`);
    }
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Registered ${commands.length} slash commands globally`);
    console.log('   Updates may take up to 1 hour to appear. Use a guild ID for instant updates.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  }
}

main();
