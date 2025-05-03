require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { initDB, getUserStats, updateUserStats } = require('./database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Config
const SOURCE_CHANNEL_ID = '1367750442318168114'; // Server A Channel (Photography Lounge)
const DEST_CHANNEL_ID = '1367751925566799943';   // Server B Channel (Viltrox Guild)
const SOURCE_GUILD_ID = '1258260561741742121';   // Photography Lounge ID
const DEST_GUILD_ID = '728905379274162177';      // Viltrox Guild ID
const SERVER_A_ROLE_ID = '1367756286422290524';  // Photography Lounge Role
const SERVER_B_ROLE_ID = '1169455759566852177';  // Viltrox Guild Role
const BOT_TOKEN = process.env.BOT_TOKEN;
const MIN_MESSAGE_INTERVAL = 10_000;
const REQUIRED_MESSAGES = 25;

client.once('ready', async () => {
  await initDB();
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const now = Date.now();

  try {
    const [sourceGuild, destGuild] = await Promise.all([
      client.guilds.fetch(SOURCE_GUILD_ID),
      client.guilds.fetch(DEST_GUILD_ID),
    ]);

    const [sourceMember, destMember] = await Promise.all([
      sourceGuild.members.fetch(userId).catch(() => null),
      destGuild.members.fetch(userId).catch(() => null),
    ]);

    const hasSourceRole = sourceMember?.roles.cache.has(SERVER_A_ROLE_ID);
    const hasDestRole = destMember?.roles.cache.has(SERVER_B_ROLE_ID);

    if (message.content.trim() === '!points') {
      const stats = await getUserStats(userId, SOURCE_GUILD_ID);
      console.log(`📊 !points requested by ${message.author.tag} in Photography Lounge`);
      return message.channel.send({
        content: `🧮 <@${userId}>, you have **${stats.count} / ${REQUIRED_MESSAGES}** points toward the **Freshman** role in Photography Lounge.`,
      });
    }

// Track Photography Lounge
if (sourceMember && !hasSourceRole) {
  const stats = await getUserStats(userId, SOURCE_GUILD_ID);
  if (now - stats.last_timestamp >= MIN_MESSAGE_INTERVAL) {
    const newCount = stats.count + 1;
    await updateUserStats(userId, SOURCE_GUILD_ID, newCount, now);

    if (newCount === REQUIRED_MESSAGES) {
      await sourceMember.roles.add(SERVER_A_ROLE_ID).catch(console.error);
      console.log(`🎉 ${message.author.tag} earned Freshman role in Photography Lounge`);
      await message.channel.send({
        content: `🎉 <@${userId}> has earned the **Freshman** role for participating in Photography Lounge! You can now submit an entry in the Viltrox x Photography Lounge "Dual Focus" Giveaway.`
      });
    }
  }
} else {
}

// Track Viltrox Guild
if (destMember && !hasDestRole) {
  const stats = await getUserStats(userId, DEST_GUILD_ID);
  if (now - stats.last_timestamp >= MIN_MESSAGE_INTERVAL) {
    const newCount = stats.count + 1;
    await updateUserStats(userId, DEST_GUILD_ID, newCount, now);

    if (newCount === REQUIRED_MESSAGES) {
      await destMember.roles.add(SERVER_B_ROLE_ID).catch(console.error);
      console.log(`🎉 ${message.author.tag} earned Freshman role in Viltrox Guild`);
      await message.channel.send({
        content: `🎉 <@${userId}> has earned the **Freshman** role for participating in Viltrox Guild! You can now submit an entry in the Viltrox x Photography Lounge "Dual Focus" Giveaway.`
      });
    }
  }
} else {
}

// Submissions
    if (message.channel.id !== SOURCE_CHANNEL_ID) return;

    if (!sourceMember || !destMember || !hasSourceRole || !hasDestRole) {
      console.log(`❌ ${message.author.tag} tried to submit without required roles in both servers`);
      await message.delete().catch(console.error);
      const warning = await message.channel.send({
        content: `⚠️ <@${userId}>, you must be a member of **both servers** and have the required roles to submit. Join here if needed: https://discord.gg/photography`,
      });
      setTimeout(() => warning.delete().catch(() => {}), 30_000);
      return;
    }

    const imageAttachment = message.attachments.find(att =>
      att.contentType?.startsWith('image/')
    );
    const hasText = !!message.content.trim();

    if (!imageAttachment || !hasText) {
      console.log(`❌ ${message.author.tag} submission missing image or caption`);
      await message.delete().catch(console.error);
      const warning = await message.channel.send({
        content: `⚠️ <@${userId}>, all submissions must include **both an image and a caption**. Please re-submit within 30 minutes.`,
      });
      setTimeout(() => warning.delete().catch(() => {}), 30_000);
      return;
    }

    const destChannel = await client.channels.fetch(DEST_CHANNEL_ID);
    if (!destChannel) return console.error('❌ Destination channel not found');

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content)
      .setImage(imageAttachment.url)
      .setColor(0x2f3136)
      .setTimestamp();

    console.log(`📤 Submission from ${message.author.tag} posted to Viltrox Guild`);
    await destChannel.send({ embeds: [embed] });

  } catch (err) {
    console.error(`🔥 Error processing message from ${message.author.tag}:`, err);
  }
});

client.login(BOT_TOKEN);