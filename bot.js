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
const SOURCE_CHANNEL_ID = '1367750442318168114'; // Photography Lounge
const DEST_CHANNEL_ID = '1367751925566799943';   // Viltrox Guild
const SOURCE_GUILD_ID = '1258260561741742121';
const DEST_GUILD_ID = '728905379274162177';
const SERVER_A_ROLE_ID = '1367756286422290524';
const SERVER_B_ROLE_ID = '1169455759566852177';
const MOD_ROLE_ID = '1309004938046734346'; // Replace with actual role ID

const BOT_TOKEN = process.env.BOT_TOKEN;
const MIN_MESSAGE_INTERVAL = 10_000;
const REQUIRED_MESSAGES = 25;

// Memory trackers
const sharedMessages = new Set(); // Tracks shared message IDs
const userSubmissions = new Map(); // Tracks active submission per user

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

    // !points command
    if (message.content.trim() === '!points') {
      const stats = await getUserStats(userId, SOURCE_GUILD_ID);
      console.log(`📊 !points requested by ${message.author.tag} in Photography Lounge`);
      return message.channel.send({
        content: `🧮 <@${userId}>, you have **${stats.count} / ${REQUIRED_MESSAGES}** points toward the **Freshman** role.`,
      });
    }

    // Points tracking - Viltrox
    if (sourceMember && !hasSourceRole) {
      const stats = await getUserStats(userId, SOURCE_GUILD_ID);
      if (now - stats.last_timestamp >= MIN_MESSAGE_INTERVAL) {
        const newCount = stats.count + 1;
        await updateUserStats(userId, SOURCE_GUILD_ID, newCount, now);

        if (newCount === REQUIRED_MESSAGES) {
          await sourceMember.roles.add(SERVER_A_ROLE_ID).catch(console.error);
          console.log(`🎉 ${message.author.tag} earned Freshman role in Viltrox`);
        }
      }
    }

    // Points tracking - Photography Lounge
    if (destMember && !hasDestRole) {
      const stats = await getUserStats(userId, DEST_GUILD_ID);
      if (now - stats.last_timestamp >= MIN_MESSAGE_INTERVAL) {
        const newCount = stats.count + 1;
        await updateUserStats(userId, DEST_GUILD_ID, newCount, now);

        if (newCount === REQUIRED_MESSAGES) {
          await destMember.roles.add(SERVER_B_ROLE_ID).catch(console.error);
          console.log(`🎉 ${message.author.tag} earned Freshman role in Photography Lounge`);
        }
      }
    }

    // ✅ SUBMISSION HANDLING
    if (message.channel.id === SOURCE_CHANNEL_ID) {
      if (!sourceMember || !destMember || !hasSourceRole || !hasDestRole) {
        console.log(`❌ ${message.author.tag} tried to submit without roles in both servers`);
        await message.delete().catch(console.error);
        const warning = await message.channel.send({
          content: `⚠️ <@${userId}>, you must be in **both servers** and have the **Freshman** role. Join: https://discord.gg/photography`,
        });
        setTimeout(() => warning.delete().catch(() => {}), 30_000);
        return;
      }

      const imageAttachment = message.attachments.find(att => att.contentType?.startsWith('image/'));
      const hasText = !!message.content.trim();

      if (!imageAttachment || !hasText) {
        console.log(`❌ ${message.author.tag} submission missing image or caption`);
        await message.delete().catch(console.error);
        const warning = await message.channel.send({
          content: `⚠️ <@${userId}>, all submissions must include **both an image and a caption**.`,
        });
        setTimeout(() => warning.delete().catch(() => {}), 30_000);
        return;
      }

      const destChannel = await client.channels.fetch(DEST_CHANNEL_ID);
      if (!destChannel) return console.error('❌ Destination channel not found');

      // 🔁 Delete user's previous submission
      const previous = userSubmissions.get(userId);
      if (previous) {
        try {
          const oldSource = await message.channel.messages.fetch(previous.sourceMessageId).catch(() => null);
          const oldDest = await destChannel.messages.fetch(previous.destMessageId).catch(() => null);

          if (oldSource) await oldSource.delete().catch(console.error);
          if (oldDest) await oldDest.delete().catch(console.error);

          console.log(`🗑️ Deleted previous submission from ${message.author.tag}`);
        } catch (err) {
          console.error(`⚠️ Error deleting old messages for ${message.author.tag}`, err);
        }
      }

      // ✅ Create and send embed
      const embed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content)
        .setImage(imageAttachment.url)
        .setColor(0x2f3136)
        .setTimestamp();

      const sent = await destChannel.send({ embeds: [embed] });

      // 📝 Track submission
      sharedMessages.add(message.id);
      userSubmissions.set(userId, {
        sourceMessageId: message.id,
        destMessageId: sent.id
      });

      console.log(`📤 Submission from ${message.author.tag} posted to Viltrox Guild`);
    }

    // 🛠️ MANUAL SHARE COMMAND
    if (message.content.startsWith('!share')) {
      if (!message.member.roles.cache.has(MOD_ROLE_ID)) {
        return message.reply('❌ You do not have permission to use this command.');
      }

      const args = message.content.trim().split(' ');
      const msgId = args[1];
      if (!msgId) return message.reply('⚠️ Usage: `!share <message_id>`');

      try {
        const sourceChannel = await client.channels.fetch(SOURCE_CHANNEL_ID);
        const destChannel = await client.channels.fetch(DEST_CHANNEL_ID);
        const msgToShare = await sourceChannel.messages.fetch(msgId);

        const img = msgToShare.attachments.find(att => att.contentType?.startsWith('image/'));
        const hasTxt = !!msgToShare.content.trim();
        const authorId = msgToShare.author.id;

        if (!img || !hasTxt) {
          return message.reply('❌ Message must include both an image and a caption.');
        }

        if (sharedMessages.has(msgId)) {
          return message.reply('⚠️ This message has already been shared.');
        }

        // Delete prior submission
        const previous = userSubmissions.get(authorId);
        if (previous) {
          const oldSource = await sourceChannel.messages.fetch(previous.sourceMessageId).catch(() => null);
          const oldDest = await destChannel.messages.fetch(previous.destMessageId).catch(() => null);
          if (oldSource) await oldSource.delete().catch(console.error);
          if (oldDest) await oldDest.delete().catch(console.error);
          console.log(`🗑️ Old manual submission from ${msgToShare.author.tag} deleted`);
        }

        // Share the message
        const embed = new EmbedBuilder()
          .setAuthor({ name: msgToShare.author.username, iconURL: msgToShare.author.displayAvatarURL() })
          .setDescription(msgToShare.content)
          .setImage(img.url)
          .setColor(0x2f3136)
          .setTimestamp();

        const sent = await destChannel.send({ embeds: [embed] });

        sharedMessages.add(msgId);
        userSubmissions.set(authorId, {
          sourceMessageId: msgId,
          destMessageId: sent.id
        });

        console.log(`🛠️ Manually shared message ${msgId} by ${msgToShare.author.tag}`);
        return message.reply('✅ Message shared successfully.');
      } catch (err) {
        console.error('🔥 Error in !share command:', err);
        return message.reply('❌ Unable to fetch or share the message. Check the ID and try again.');
      }
    }

    // 🧹 ENFORCE SUBMISSION RULES
    if (message.content === '!enforceSubmissions') {
      if (!message.member.roles.cache.has(MOD_ROLE_ID)) {
        return message.reply('❌ You do not have permission to use this command.');
      }

      try {
        const sourceChannel = await client.channels.fetch(SOURCE_CHANNEL_ID);
        const destChannel = await client.channels.fetch(DEST_CHANNEL_ID);
        const messages = await sourceChannel.messages.fetch({ limit: 100 });

        const userMessages = new Map(); // userId -> { sourceMsg, destMsgId }

        for (const msg of messages.values()) {
          if (msg.author.bot) continue;

          const hasImage = msg.attachments.some(att => att.contentType?.startsWith('image/'));
          const hasText = !!msg.content.trim();

          if (!hasImage || !hasText) continue;

          const userId = msg.author.id;

          if (!userMessages.has(userId)) {
            // First valid submission
            const destMsg = [...sharedMessages].find(id => userSubmissions.get(userId)?.sourceMessageId === msg.id);
            userMessages.set(userId, {
              sourceMsg: msg,
              destMsgId: userSubmissions.get(userId)?.destMessageId || null
            });
          } else {
            // Delete duplicate submission
            await msg.delete().catch(console.error);
            const prev = userMessages.get(userId);
            if (prev?.destMsgId) {
              const oldDest = await destChannel.messages.fetch(prev.destMsgId).catch(() => null);
              if (oldDest) await oldDest.delete().catch(console.error);
            }
            console.log(`🗑️ Duplicate submission from ${msg.author.tag} removed`);
          }
        }

        message.reply('✅ Duplicate submissions cleaned up.');
      } catch (err) {
        console.error('🔥 Error enforcing submission rules:', err);
        message.reply('❌ Error while enforcing submissions.');
      }
    }

  } catch (err) {
    console.error(`🔥 Error processing message from ${message.author.tag}`);
  }
});

client.login(BOT_TOKEN);