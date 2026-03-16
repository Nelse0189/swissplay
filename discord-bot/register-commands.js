#!/usr/bin/env node
/**
 * One-time script to register slash commands with Discord.
 * Use this when running the bot via Firebase Functions (no persistent Node instance).
 *
 * Run: node register-commands.js
 *       node register-commands.js 1452971494832603138   # deploy to specific guild
 * Requires: .env with DISCORD_TOKEN, DISCORD_CLIENT_ID
 * Optional: DISCORD_GUILD_ID in .env, or pass guild ID as first CLI argument
 */
import { config } from 'dotenv';
import { REST, Routes } from 'discord.js';
import { commands } from './commandDefinitions.js';

config();

const TEST_GUILD_ID = '1452971494832603138';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID || process.argv[2] || TEST_GUILD_ID;

  if (!token || !clientId) {
    console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    // 1. Register globally (may take up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Registered ${commands.length} slash commands globally`);
    console.log('   Global updates may take up to 1 hour to appear.');

    // 2. Register to guild for instant testing
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Registered ${commands.length} slash commands to guild ${guildId} (instant)`);
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
    process.exit(1);
  }
}

main();
