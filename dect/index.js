const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Perspective = require('perspective-api-client');
const axios = require('axios');
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
    messageHistory: { type: [String], default: [] } // Added to store message history
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
        user.messageHistory.push(message.content); // Add message to history
        if (user.messageHistory.length > 10) { // Limit history to last 10 messages
            user.messageHistory.shift();
        }
        await user.save();

        // Perspective API analysis
        let analyzeResult;
        try {
            analyzeResult = await perspective.analyze(message.content, {
                attributes: ['TOXICITY', 'SPAM', 'INSULT', 'THREAT', 'FLIRTATION']
            });
        } catch (error) {
            console.error('Error analyzing message with Perspective API:', error);
            return;
        }

        const isSpam = analyzeResult.attributeScores.SPAM.summaryScore.value > 0.7;
        const isToxic = analyzeResult.attributeScores.TOXICITY.summaryScore.value > 0.7;
        const isInsult = analyzeResult.attributeScores.INSULT.summaryScore.value > 0.7;
        const isThreat = analyzeResult.attributeScores.THREAT.summaryScore.value > 0.7;

        // Additional scam keyword detection
        const scamKeywords = ['free nitro', 'click this link', 'giveaway', 'claim your prize'];
        const containsScamKeyword = scamKeywords.some(keyword => message.content.toLowerCase().includes(keyword));

        // Additional link analysis using VirusTotal API
        const containsLink = /(https?:\/\/[^\s]+)/.test(message.content);
        let isPhishingLink = false;
        if (containsLink) {
            const links = message.content.match(/(https?:\/\/[^\s]+)/g);
            for (const link of links) {
                try {
                    const response = await axios.get(`https://www.virustotal.com/vtapi/v2/url/report`, {
                        params: {
                            apikey: process.env.VIRUSTOTAL_API_KEY,
                            resource: link
                        }
                    });
                    if (response.data.positives > 0) {
                        isPhishingLink = true;
                        break;
                    }
                } catch (error) {
                    console.error('Error checking link:', error);
                }
            }
        }

        const moderationChannel = await client.channels.fetch(process.env.MODERATION_CHANNEL_ID);
        if (!moderationChannel) return;

        if (isSpam || isToxic || isInsult || isThreat || containsScamKeyword || isPhishingLink) {
            const flags = [];
            if (isSpam) flags.push('Spam');
            if (isToxic) flags.push('Toxicity');
            if (isInsult) flags.push('Insult');
            if (isThreat) flags.push('Threat');
            if (containsScamKeyword) flags.push('Scam');
            if (isPhishingLink) flags.push('Phishing Link');

            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Flagged Message')
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

        // Check for misinformation using predefined keywords
        const misinformationKeywords = ['fake news', 'misinformation', 'false information'];
        const containsMisinformation = misinformationKeywords.some(keyword => message.content.includes(keyword));

        if (containsMisinformation) {
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Flagged Message')
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
