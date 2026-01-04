import { Client, GatewayIntentBits, Partials, Message, AttachmentBuilder, REST, Routes, Interaction } from 'discord.js';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import dotenv from 'dotenv';
import * as configCommand from './commands/config.js';

dotenv.config();

// Type definitions
interface ConversationMessage {
    role: 'user' | 'model';
    parts: string;
}

interface ImageGenerationData {
    prompt: string;
    generatedImages?: any[]; // Store the generated output images for regeneration
}

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// Model names
const IMAGE_MODEL_NAME = "models/gemini-3-pro-image-preview";
const TEXT_MODEL_NAME = "models/gemini-2.5-flash";

// Store conversation history: messageId -> history
const conversationHistory = new Map<string, ConversationMessage[]>();

// Store image generation metadata: messageId -> generation data
const imageMetadata = new Map<string, ImageGenerationData>();

client.once('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    console.log(`Image Model: ${IMAGE_MODEL_NAME}`);
    console.log(`Text Model: ${TEXT_MODEL_NAME}`);

    // Register Slash Commands
    const commands = [configCommand.data.toJSON()];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(client.user!.id),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Interaction Handler
client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'config') {
            await configCommand.execute(interaction);
        }
    } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'config') {
            await configCommand.autocomplete(interaction);
        }
    }
});

// Helper function to detect if user wants image generation
function wantsImageGeneration(text: string): boolean {
    const imageKeywords = [
        'generate', 'create', 'make', 'draw', 'image', 'picture', 
        'photo', 'render', 'art', 'artwork', 'illustration', 'sketch',
        'design', 'visualize', 'show me', 'paint'
    ];
    
    const lowerText = text.toLowerCase();
    return imageKeywords.some(keyword => lowerText.includes(keyword));
}

// Helper function to extract prompt from text
function extractPrompt(text: string): string {
    // Remove common prefixes more aggressively
    const cleaned = text
        .replace(/^(generate|create|make|draw|show me|paint|give me)(\s+(an?|the|this))?(\s+(image|picture|photo|one))?(\s+(of|like|with))?/i, '')
        .trim();
    
    return cleaned || text;
}

// Helper function to get inline image data
function getInlineImage(candidates: any[] | undefined) {
    if (!candidates || candidates.length === 0) return null;
    const parts = candidates[0].content.parts;
    for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
            return part.inlineData;
        }
    }
    return null;
}

// Helper function to check if channel supports typing
function supportsTyping(channel: any): channel is { sendTyping: () => Promise<void> } {
    return 'sendTyping' in channel && typeof channel.sendTyping === 'function';
}

// Process image generation
async function generateImages(
    message: Message, 
    promptText: string, 
    previousGeneratedImages: any[] = [],
    isRegeneration: boolean = false,
    extraAttachments: any[] = []
): Promise<void> {
    let statusMessage: Message | null = null;
    let progressInterval: NodeJS.Timeout | null = null;

    try {
        console.log(`[DEBUG] Generating images: ${promptText}`);
        if (supportsTyping(message.channel)) {
            await message.channel.sendTyping();
        }
        
        const statusText = isRegeneration 
            ? "🔄 **Regenerating with modifications...** Please wait."
            : "🎨 **Generating variants...** Please wait.";
        statusMessage = await message.reply(statusText);

        // Keep typing indicator active
        progressInterval = setInterval(() => {
            if (supportsTyping(message.channel)) {
                message.channel.sendTyping().catch(() => {});
            }
        }, 5000);

        // Prepare prompt with better structure
        const finalPrompt = `
<system_instructions>
Generate an image based on the user's prompt.
Default Aspect Ratio: 16:9 Landscape (unless the user specifies otherwise).
Maintain high visual fidelity and follow the style instructions closely.
</system_instructions>

<user_prompt>
${promptText}
</user_prompt>
`.trim();

        console.log(`[DEBUG] Final Prompt: ${finalPrompt}`);
        const inputs: any[] = [finalPrompt];

        // Add previously generated images for regeneration
        if (previousGeneratedImages.length > 0) {
            inputs.push(...previousGeneratedImages);
            console.log(`[DEBUG] Added ${previousGeneratedImages.length} previously generated images for regeneration.`);
        }

        // Add extra attachments (from replies)
        if (extraAttachments.length > 0) {
            inputs.push(...extraAttachments);
            console.log(`[DEBUG] Added ${extraAttachments.length} extra attachments from reply context.`);
        }

        // Process message attachments (only if NOT regenerating - new attachments override generated images)
        if (message.attachments.size > 0 && !isRegeneration) {
            console.log(`[DEBUG] Processing ${message.attachments.size} attachments...`);
            const attachmentPromises = Array.from(message.attachments.values()).map(async (attachment) => {
                if (!attachment.contentType?.startsWith('image/')) {
                    console.log(`[DEBUG] Skipping attachment (not image): ${attachment.name}`);
                    return null;
                }

                try {
                    console.log(`[DEBUG] Fetching attachment: ${attachment.url}`);
                    const response = await fetch(attachment.url);
                    const arrayBuffer = await response.arrayBuffer();
                    return {
                        inlineData: {
                            data: Buffer.from(arrayBuffer).toString('base64'),
                            mimeType: attachment.contentType
                        }
                    };
                } catch (err: any) {
                    console.error(`Failed to download attachment: ${err.message}`);
                    return null;
                }
            });

            const attachments = (await Promise.all(attachmentPromises)).filter(a => a !== null);
            inputs.push(...attachments);
            console.log(`[DEBUG] Added ${attachments.length} message attachments.`);
        }

        // Call Gemini API
        console.log(`[DEBUG] Calling Gemini API with model: ${IMAGE_MODEL_NAME}`);
        const model = genAI.getGenerativeModel({ model: IMAGE_MODEL_NAME });
        
        // Generate 2 variants in parallel
        const variantCount = 3;
        const generationPromises = Array(variantCount).fill(null).map(() => model.generateContent(inputs));

        console.log(`[DEBUG] Waiting for ${variantCount} generations...`);
        const results = await Promise.all(generationPromises);
        
        // Handle responses
        if (progressInterval) clearInterval(progressInterval);

        const attachments: AttachmentBuilder[] = [];
        const generatedImageData: any[] = []; // Store for metadata
        let combinedText = "";

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const response = await result.response;
            
            // Check for text
            try {
                const text = response.text();
                if (text) combinedText += `Variant ${i+1}: ${text}\n`;
            } catch (e) {
                // Ignore text error
            }

            const imageData = getInlineImage(response.candidates);
            if (imageData) {
                const buffer = Buffer.from(imageData.data, 'base64');
                attachments.push(new AttachmentBuilder(buffer, { name: `generated_variant_${i+1}.png` }));
                
                // Store the image data for potential regeneration
                generatedImageData.push({
                    inlineData: {
                        data: imageData.data,
                        mimeType: imageData.mimeType
                    }
                });
            }
        }

        if (attachments.length > 0) {
            const replyMessage = await statusMessage.edit({ 
                content: combinedText ? `Generated Images:\n${combinedText}` : "Here are your generated variants:", 
                files: attachments 
            });
            
            // Store metadata for potential regeneration with the generated images
            imageMetadata.set(replyMessage.id, {
                prompt: promptText,
                generatedImages: generatedImageData
            });
        } else if (combinedText) {
            await statusMessage.edit(combinedText);
        } else {
            await statusMessage.edit("Generation finished, but no output (text or image) was found in the responses.");
        }

    } catch (error: any) {
        if (progressInterval) clearInterval(progressInterval);
        console.error('Generation Error:', error);
        
        let errorMessage = "An error occurred during generation.";
        if (error.message?.includes('API key')) errorMessage = "Invalid or missing API Key.";
        if (error.message?.includes('model')) errorMessage = `Model "${IMAGE_MODEL_NAME}" not found or not accessible. Check your API access.`;
        
        if (statusMessage) {
            if (error.message?.includes('429') || error.message?.includes('Quota exceeded')) {
                await statusMessage.edit(`❌ **Quota Exceeded / Rate Limited**\nThe API returned a "Too Many Requests" error. This usually means:\n1. You are on the Free Tier and this model (${IMAGE_MODEL_NAME}) is not available for free (Limit: 0).\n2. Or you have hit the rate limit for the minute/day.\n\nPlease check your Google AI Studio billing settings.`);
            } else {
                await statusMessage.edit(`❌ ${errorMessage}`);
            }
        } else {
            message.reply(errorMessage);
        }
    }
}

// Process text conversation
async function handleTextConversation(message: Message, content: string, replyToMessageId?: string): Promise<void> {
    let statusMessage: Message | null = null;
    
    try {
        if (supportsTyping(message.channel)) {
            await message.channel.sendTyping();
        }
        
        // Get or create conversation history
        const historyKey = replyToMessageId || message.id;
        let history = conversationHistory.get(historyKey) || [];
        
        // Add user message to history
        history.push({
            role: 'user',
            parts: content
        });
        
        // Create chat session with history
        const model = genAI.getGenerativeModel({ model: TEXT_MODEL_NAME });
        const chat = model.startChat({
            history: history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.parts }]
            }))
        });
        
        // Send message and get response
        const result = await chat.sendMessage(content);
        const response = await result.response;
        const text = response.text();
        
        // Add model response to history
        history.push({
            role: 'model',
            parts: text
        });
        
        // Store updated history
        conversationHistory.set(historyKey, history);
        
        // Send response
        const replyMessage = await message.reply(text);
        
        // Store this message's history for threading
        conversationHistory.set(replyMessage.id, history);
        
    } catch (error: any) {
        console.error('Text Conversation Error:', error);
        
        let errorMessage = "An error occurred while processing your message.";
        if (error.message?.includes('API key')) errorMessage = "Invalid or missing API Key.";
        
        message.reply(`❌ ${errorMessage}`);
    }
}

client.on('messageCreate', async (message: Message) => {
    // Ignore bots
    if (message.author.bot) return;

    // Check if the bot is mentioned
    if (!message.mentions.has(client.user!)) return;

    // Remove the mention from the content
    const content = message.content.replace(/<@!?[0-9]+>/g, '').trim();
    
    if (!content) {
        message.reply("How can I help you? I can generate images or have a conversation with you!");
        return;
    }

    // Check if this is a reply to a bot message
    if (message.reference?.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            
            // Check if replying to the bot
            if (repliedMessage.author.id === client.user!.id) {
                // Check if replying to an image generation
                if (imageMetadata.has(repliedMessage.id)) {
                    const metadata = imageMetadata.get(repliedMessage.id)!;
                    
                    // Regenerate with modified prompt and the previously generated images
                    const modifiedPrompt = `${metadata.prompt}, ${content}`;
                    await generateImages(message, modifiedPrompt, metadata.generatedImages || [], true);
                    return;
                }
                
                // Check if replying to a text conversation
                if (conversationHistory.has(repliedMessage.id)) {
                    await handleTextConversation(message, content, repliedMessage.id);
                    return;
                }
            } else {
                // Replying to a user message - check for attachments to use as context
                if (wantsImageGeneration(content) && repliedMessage.attachments.size > 0) {
                    console.log(`[DEBUG] User replied to a message with ${repliedMessage.attachments.size} attachments.`);
                    
                    const attachmentPromises = Array.from(repliedMessage.attachments.values()).map(async (attachment) => {
                        if (!attachment.contentType?.startsWith('image/')) return null;
                        try {
                            const response = await fetch(attachment.url);
                            const arrayBuffer = await response.arrayBuffer();
                            return {
                                inlineData: {
                                    data: Buffer.from(arrayBuffer).toString('base64'),
                                    mimeType: attachment.contentType
                                }
                            };
                        } catch (err) {
                            console.error(`Failed to download replied attachment:`, err);
                            return null;
                        }
                    });

                    const extraAttachments = (await Promise.all(attachmentPromises)).filter(a => a !== null);
                    
                    const prompt = extractPrompt(content);
                    await generateImages(message, prompt, [], false, extraAttachments);
                    return;
                }
            }
        } catch (err) {
            console.error('Error fetching replied message:', err);
        }
    }

    // Detect intent: image generation or text conversation
    if (wantsImageGeneration(content)) {
        // if (true) {
        //     await message.reply(`❌ **Quota Exceeded**\nThe API returned a "Too Many Requests" error. This usually means:\n1. You are on the Free Tier and this model (${IMAGE_MODEL_NAME}) is not available for free (Limit: 0).\n2. Or you have hit the rate limit for the minute/day.\n\nPlease check your Google AI Studio billing settings.`);
        //     return;
        // }
        
        const prompt = extractPrompt(content);
        await generateImages(message, prompt);
    } else {
        await handleTextConversation(message, content);
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
