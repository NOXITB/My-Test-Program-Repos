const axios = require('axios');
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Perspective = require('perspective-api-client');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const perspective = new Perspective({ apiKey: process.env.PERSPECTIVE_API_KEY });

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

const userSchema = new mongoose.Schema({
    userId: String,
    username: String,
    discriminator: String,
    joinedAt: Date,
    createdAt: Date,
    messageCount: { type: Number, default: 0 },
    isSpammer: { type: Boolean, default: false },
    isTroll: { type: Boolean, default: false },
    isMisinformation: { type: Boolean, default: false },
    infractions: { type: Number, default: 0 },
    messageHistory: { type: [String], default: [] }
});

const User = mongoose.model('User', userSchema);

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
    const accountAge = new Date() - member.user.createdAt;
    const isNewAccount = accountAge < 1000 * 60 * 60 * 24 * 7; // 7 days

    const newUser = new User({
        userId: member.id,
        username: member.user.username,
        discriminator: member.user.discriminator,
        joinedAt: new Date(),
        createdAt: member.user.createdAt,
        isSpammer: isNewAccount
    });

    await newUser.save();
    console.log(`New user ${member.user.tag} added to the database.`);
});

async function scanUrl(url) {
    try {
      const response = await axios.post(
        'https://www.virustotal.com/api/v3/urls',
        new URLSearchParams({ url: url }), // URL-encoded form data
        {
          headers: {
            'x-apikey': process.env.VIRUSTOTAL_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log('Analysis ID:', response.data.data.id);
      return response.data.data.id; // Return the analysis ID
    } catch (error) {
      console.error('Error submitting URL to VirusTotal:', error);
      return null;
    }
  }
  
  async function getAnalysisReport(analysisId) {
    try {
      const response = await axios.get(
        `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
        {
          headers: {
            'x-apikey': process.env.VIRUSTOTAL_API_KEY,
            'Accept': 'application/json'
          }
        }
      );
      return response.data.data.attributes.stats; // Return the analysis stats
    } catch (error) {
      console.error('Error retrieving analysis report from VirusTotal:', error);
      return null;
    }
  }
  
  


client.on('messageCreate', async message => {
    if (message.author.bot) return;

    try {
        let user = await User.findOne({ userId: message.author.id });
        if (!user) {
            user = new User({
                userId: message.author.id,
                username: message.author.username,
                discriminator: message.author.discriminator,
                joinedAt: new Date(),
                createdAt: message.author.createdAt
            });
            await user.save();
            console.log(`User ${message.author.tag} added to the database.`);
        }

        user.messageCount += 1;
        user.messageHistory.push(message.content);
        if (user.messageHistory.length > 10) {
            user.messageHistory.shift();
        }
        await user.save();

        let analyzeResult;
        try {
            analyzeResult = await perspective.analyze(message.content, {
                attributes: ['TOXICITY', 'SPAM', 'INSULT', 'THREAT', 'FLIRTATION']
            });
        } catch (error) {
            console.error('Error analyzing message with Perspective API:');
        }

        const isSpam = analyzeResult?.attributeScores.SPAM?.summaryScore.value > 0.7;
        const isToxic = analyzeResult?.attributeScores.TOXICITY?.summaryScore.value > 0.7;
        const isInsult = analyzeResult?.attributeScores.INSULT?.summaryScore.value > 0.7;
        const isThreat = analyzeResult?.attributeScores.THREAT?.summaryScore.value > 0.7;

        const scamKeywords = ['free nitro', 'click this link', 'giveaway', 'claim your prize'];
        const containsScamKeyword = scamKeywords.some(keyword => message.content.toLowerCase().includes(keyword));

        const containsLink = /(https?:\/\/[^\s]+)/.test(message.content);
        let isMaliciousLink = false;
        let maliciousDetails = "";
        const safeUrls = ['discord.gg', 'discord.com', 'discordapp.com', 'twitter.com', 'reddit.com', 'youtube.com', 'twitch.tv', 'github.com', 'stackoverflow.com', 'wikipedia.org', 'google.com', 'amazon.com', 'microsoft.com', 'apple.com', 'spotify.com', 'netflix.com', 'instagram.com', 'linkedin.com', 'medium.com', 'dropbox.com', 'slack.com', 'trello.com', 'zoom.us', 'bit.ly', 't.co', 'ow.ly', 'imgur.com', 'gfycat.com', 'gyazo.com', 'streamable.com', 'tenor.com', 'giphy.com', 'imgflip.com', 'pbs.twimg.com', 'discordemoji.com', 'steamcommunity.com', 'gamerant.com', 'gamespot.com', 'kotaku.com', 'ign.com', 'polygon.com', 'npr.org', 'bbc.com', 'cnn.com', 'nytimes.com', 'wired.com', 'arstechnica.com', 'forbes.com', 'businessinsider.com', 'cnbc.com', 'investopedia.com', 'wsj.com'];


        if (containsLink) {
            const links = message.content.match(/(https?:\/\/[^\s]+)/g);
            for (const link of links) {
                const urlObj = new URL(link);
                if (safeUrls.includes(urlObj.hostname)) {
                    continue;
                }

                const analysisId = await scanUrl(link);
                if (!analysisId) continue;

                // Wait for a moment to allow the analysis to be processed
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 30 seconds
                const urlReport = await axios.get(
                    `https://www.virustotal.com/api/v3/analyses/${analysisId}/item`,
                    {
                      headers: {
                        'x-apikey': process.env.VIRUSTOTAL_API_KEY,
                        'Accept': 'application/json'
                      }
                    }
                  );

                const analysisStats = await getAnalysisReport(analysisId);
                const normalizedUrl = urlReport.data.data;
                const selfLink = normalizedUrl.links.self;
                const idls = selfLink.split('/').pop(); // Extracts the last part of the URL after the last '/'
                console.log(idls); // Output: ef297324db5d630feb16966a564518a8f43bb0395747764be17dc91343a07da2
                
                if (analysisStats && (analysisStats.malicious > 0 || analysisStats.suspicious > 0)) {
                    isMaliciousLink = true;
                    maliciousDetails = `Malicious: ${analysisStats.malicious}, Suspicious: ${analysisStats.suspicious}. [Report Link](https://www.virustotal.com/gui/url/${idls}/detection)`;
                    break;
                }
            }
        }

        const moderationChannel = await client.channels.fetch(process.env.MODERATION_CHANNEL_ID);
        if (!moderationChannel) return;

        if (isSpam || isToxic || isInsult || isThreat || containsScamKeyword || isMaliciousLink) {
            const flags = [];
            if (isSpam) flags.push('Spam');
            if (isToxic) flags.push('Toxicity');
            if (isInsult) flags.push('Insult');
            if (isThreat) flags.push('Threat');
            if (containsScamKeyword) flags.push('Scam');
            if (isMaliciousLink) flags.push('Malicious Link');

            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Flagged Message')
                .setDescription(`A message from ${message.author.tag} has been flagged for the following reasons: ${flags.join(', ')}`)
                .addFields(
                    { name: 'User', value: `${message.author.tag} (${message.author.id})` },
                    { name: 'Message', value: message.content },
                    { name: 'Flags', value: flags.join(', ') },
                    { name: 'Jump to Message', value: `[Click Here](${messageLink})` },
                    { name: 'Channel', value: message.channel.toString() },
                    { name: 'Previous Infractions', value: user.infractions.toString() }
                )
                .setTimestamp()
                .setFooter({ text: `Message ID: ${message.id}` });

            if (isMaliciousLink) {
                embed.addFields({ name: 'Malicious Link Details', value: maliciousDetails });
            }

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('timeout')
                        .setLabel('Timeout')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('ban')
                        .setLabel('Ban')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setLabel('Delete')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('false_positive')
                        .setLabel('False Positive')
                        .setStyle(ButtonStyle.Success)
                );

            await moderationChannel.send({ embeds: [embed], components: [buttons] });

            user.isSpammer = isSpam;
            user.isTroll = isToxic || isInsult;
            user.infractions += 1;
            await user.save();
        }

        const misinformationKeywords = ['fake news', 'misinformation', 'false information'];
        const containsMisinformation = misinformationKeywords.some(keyword => message.content.includes(keyword));

        if (containsMisinformation) {
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Flagged Message')
                .setDescription(`A message from ${message.author.tag} has been flagged for containing misinformation.`)
                .addFields(
                    { name: 'User', value: `${message.author.tag} (${message.author.id})` },
                    { name: 'Message', value: message.content },
                    { name: 'Flags', value: 'Misinformation' },
                    { name: 'Jump to Message', value: `[Click Here](${messageLink})` },
                    { name: 'Channel', value: message.channel.toString() },
                    { name: 'Previous Infractions', value: user.infractions.toString() }
                )
                .setTimestamp()
                .setFooter({ text: `Message ID: ${message.id}` });

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('timeout')
                        .setLabel('Timeout')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('ban')
                        .setLabel('Ban')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setLabel('Delete')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('false_positive')
                        .setLabel('False Positive')
                        .setStyle(ButtonStyle.Success)
                );

            await moderationChannel.send({ embeds: [embed], components: [buttons] });

            user.isMisinformation = true;
            user.infractions += 1;
            await user.save();
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    try {
        const message = interaction.message;
        const embed = message.embeds[0];
        if (!embed || !embed.footer || !embed.footer.text) {
            await interaction.reply({ content: 'Footer information missing. Cannot perform action.', ephemeral: true });
            return;
        }

        const userIdMatch = embed.fields.find(field => field.name === 'User').value.match(/\((\d+)\)/);
        if (!userIdMatch) {
            await interaction.reply({ content: 'User ID not found in the embed.', ephemeral: true });
            return;
        }
        const userId = userIdMatch[1];

        const user = await client.users.fetch(userId);
        const member = await interaction.guild.members.fetch(userId);

        if (!user || !member) {
            await interaction.reply({ content: 'User not found.', ephemeral: true });
            return;
        }

        const originalMessageIdMatch = embed.footer.text.match(/Message ID: (\d+)/);
        if (!originalMessageIdMatch) {
            await interaction.reply({ content: 'Original message ID not found.', ephemeral: true });
            return;
        }
        const originalMessageId = originalMessageIdMatch[1];

        const originalMessage = await interaction.guild.channels.cache
            .get(embed.fields.find(field => field.name === 'Channel').value.match(/<#(\d+)>/)[1])
            .messages.fetch(originalMessageId);

        if (interaction.customId === 'timeout') {
            await member.timeout(10 * 60 * 1000); // 10 minutes timeout
            await interaction.reply({ content: `${user.tag} has been timed out for 10 minutes.`, ephemeral: true });
        } else if (interaction.customId === 'ban') {
            await member.ban({ reason: 'Moderation action taken' });
            await interaction.reply({ content: `${user.tag} has been banned.`, ephemeral: true });
        } else if (interaction.customId === 'delete') {
            await originalMessage.delete();
            await interaction.reply({ content: 'Message has been deleted.', ephemeral: true });
        } else if (interaction.customId === 'false_positive') {
            user.infractions -= 1;
            await user.save();
            await interaction.reply({ content: 'Message marked as false positive.', ephemeral: true });
        }

        const newEmbed = EmbedBuilder.from(embed)
            .setColor('#00FF00')
            .spliceFields(embed.fields.findIndex(field => field.name === 'Message'), 1, { name: 'Action Taken', value: interaction.customId.charAt(0).toUpperCase() + interaction.customId.slice(1) });

        await message.edit({ embeds: [newEmbed], components: [] });
    } catch (error) {
        console.error('Error handling interaction:', error);
        await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
    }
});


client.login(process.env.DISCORD_TOKEN);
