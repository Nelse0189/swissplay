# SwissPlay Discord Server Setup – Invite Link Flow

This guide explains how to set up your **SwissPlay community Discord** so new users can easily install the bot in their own servers.

---

## Recommended flow: `/invite` command

The bot includes an `/invite` slash command. When someone runs it, they receive a message with a button that links directly to the bot authorization page.

**Flow:**
1. User joins your SwissPlay Discord server.
2. They run `/invite` (or see it in `/help`).
3. They click **"Add Bot to My Server"**.
4. They choose their server and authorize.
5. The bot is installed in their server.

No extra setup is required on your side; the command works as soon as the bot is in your server.

---

## Optional: pinned message with invite link

You can also pin the invite link in a channel so users see it without running a command.

### 1. Pick a channel

Use a channel like `#get-started`, `#bot-setup`, or `#resources`.

### 2. Post a message with the link

Use this OAuth2 invite URL (replace `CLIENT_ID` with your bot’s Client ID from the Discord Developer Portal if different):

```
https://discord.com/oauth2/authorize?client_id=1445440806797185129&permissions=84672&scope=bot%20applications.commands
```

Example message:

> **Add the Swiss Play bot to your server**
>
> If you manage a team, add the bot to your Discord server for:
> - Team availability management
> - Scrim scheduling
> - Player invites via Discord
>
> 👉 [Click here to add the bot](https://discord.com/oauth2/authorize?client_id=1445440806797185129&permissions=84672&scope=bot%20applications.commands)
>
> You need Administrator or Manage Server permission.

### 3. Pin the message

Right‑click the message → **Pin Message**.

---

## Optional: welcome message with invite link

If you use a welcome bot (e.g. MEE6, Carl-bot), add the invite link to the welcome message so new members see it right away.

---

## URL parameters

| Parameter      | Value   | Purpose                                           |
|----------------|---------|---------------------------------------------------|
| `client_id`    | Your bot’s Application ID | Your bot’s app/bot ID                      |
| `permissions`  | `84672` | View channels, send messages, read history, embeds, add reactions |
| `scope`        | `bot applications.commands` | Allows bot + slash commands          |

To customize permissions, use the [Discord Developer Portal URL Generator](https://discord.com/developers/applications) → OAuth2 → URL Generator.

---

## Calendar Events (Discord Scheduled Events)

For the **Calendar** tab (Team Management → Calendar), the bot syncs events from the website to Discord native Scheduled Events. This requires the **Manage Events** permission. If calendar events are not appearing in your server’s Events list, re-add the bot with **Manage Events** enabled (or use Administrator).

---

## Quick reference for new users

1. Join the SwissPlay Discord.
2. Run `/invite` or open the pinned invite link in `#get-started`.
3. Click the link or button and choose your server.
4. Create a team on swissplay.gg and verify your Discord in Team Management → Settings.
5. Use `/add-player` to invite teammates.
