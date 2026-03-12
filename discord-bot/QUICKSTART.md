# SwissPlay Bot - 5-Minute Quickstart

Get your team up and running in **5 minutes**.

---

## Step 1: Create Your Team (2 minutes)

1. Go to **solaris-cd166.firebaseapp.com**
2. Sign up / Sign in
3. Click **"Create Team"**
4. Fill in:
   - Team name
   - Region
   - Average SR
   - Division
5. Click **"Create Team"**

✅ Done! You're now the owner.

---

## Step 2: Invite Bot to Discord Server (1 minute)

1. In Team Management → Settings on website
2. Find **"DISCORD BOT SETUP"** section
3. Click **"INVITE BOT TO DISCORD SERVER"**
4. Authorize in your server

✅ Bot is now in your server!

---

## Step 3: Verify Your Discord (1 minute)

**Option A: Website Button (Easiest)**
1. Stay in Team Management → Settings
2. Find **"LINK YOUR DISCORD ACCOUNT"** section
3. Click **"VERIFY DISCORD (MANAGERS)"**
4. Check Discord DMs
5. Click **"✅ Confirm"**

**Option B:** Enter your Discord username in the form below and click the link button to receive a verification DM.

✅ You're verified and can manage your team!

---

## Step 4: Add Players (1 minute)

In your Discord server, run:

```
/add-player @player1
/add-player @player2
/add-player @player3
```

✅ Players are added and get welcome DMs!

---

## Step 5: Tell Players to Set Availability

Each player should run:

```
/my-availability
```

Then reply in DM with something like:
```
Weekdays 6-10pm
```

✅ Team is ready to schedule scrims!

---

## Next: Schedule Your First Scrim

When you're ready to schedule, run:

```
/schedule-scrim date:friday time:8pm notes:First practice!
```

All players get DMs with a poll. You get real-time updates as they respond.

---

## Quick Command Reference

### You (Manager)
```bash
# Verify Discord via website (Team Management → Settings) first
/add-player @user               # Add team members
/find-time                      # Find best available times
/schedule-scrim date:X time:Y   # Schedule + poll team
/team-stats                     # View analytics
```

### Your Players
```bash
/my-availability                # Set their schedule (via DM)
/my-team                        # View team info
/upcoming-scrims                # See scheduled scrims
```

---

## That's It!

You now have a fully functional Discord-managed team.

**What happens next:**
- Players set their availability via DMs
- You schedule scrims with one command
- Everyone gets polled automatically
- Reminders go out 24h and 1h before
- All data syncs to website in real-time

**Need help?** Check `USER_GUIDE.md` for complete documentation.

---

## Common First-Time Questions

**Q: Do players need a website account?**  
**A:** No! Players only need Discord. Everything they need is bot commands.

**Q: Can I have multiple teams?**  
**A:** Yes! Just create multiple teams on the website. The bot handles all of them.

**Q: What if someone doesn't have Discord?**  
**A:** You can still add them on the website manually, but they won't get availability requests or scrim polls.

**Q: Is player data private?**  
**A:** Yes. Only you (manager) can see individual player availability. Players only see their own data.

**Q: How do I remove the bot?**  
**A:** Kick it from your Discord server. Team data on the website stays safe.

---

## Pro Tips

1. **Add everyone at once** - Use `/add-player` for all members in one session
2. **Check `/find-time` first** - Don't guess when to schedule
3. **Give 24h notice minimum** - Players need time to see the DM
4. **Use `/team-stats` weekly** - Track engagement and availability coverage
5. **Natural language works** - Players can say "Weekdays evening" instead of exact times

---

*Ready to go? Start with Step 1!*
