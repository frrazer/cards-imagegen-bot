import { Client, GatewayIntentBits, Partials, Message, AttachmentBuilder } from 'discord.js';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Type definitions
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

// Store image generation metadata: messageId -> generation data
const imageMetadata = new Map<string, ImageGenerationData>();

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    console.log(`Image Model: ${IMAGE_MODEL_NAME}`);
    console.log(`Text Model: ${TEXT_MODEL_NAME}`);
});

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

// Refine prompt using AI for better image generation
async function refinePromptForImageGeneration(rawPrompt: string): Promise<string> {
    const refinementPrompt = `You are an expert at extracting creative descriptions from user prompts for AI image generation.

Your job is to extract and organize the CREATIVE CONTENT ONLY from the user's prompt. Focus on:
- What the creature/model looks like (colors, features, characteristics)
- What the background environment is (setting, objects, atmosphere)
- The mood and feeling (spooky, cheerful, mysterious, etc.)
- Special effects or details (lighting, particles, weather)
- Any pose or action the creature should do

DO NOT include technical requirements like:
- Composition rules (centering, prominence, focal points, percentages)
- Art style specifics (pixel art, voxel, resolution)
- Camera angles or framing
- Integration instructions (shadows, grounding, etc.)

Keep it clean and creative. Remove conversational phrases like "generate this", "maybe", "could you", "give me".

Organize the output into simple sections:
**Creature:** [description of the model/creature]
**Background:** [description of the environment/setting]
**Mood:** [atmosphere and feeling]
**Pose/Action:** [what the creature is doing - if not specified, suggest a natural, lively pose that fits the creature's character]

User's prompt:
${rawPrompt}

Refined creative description (output ONLY the description, no explanations):`;

    try {
        const model = genAI.getGenerativeModel({ model: TEXT_MODEL_NAME });
        const result = await model.generateContent(refinementPrompt);
        const response = await result.response;
        const refined = response.text().trim();
        
        console.log(`[REFINEMENT] Original: "${rawPrompt}"`);
        console.log(`[REFINEMENT] Refined: "${refined}"`);
        
        // Fallback to original if refinement fails or is empty
        return refined || rawPrompt;
    } catch (error) {
        console.error('[REFINEMENT] Failed, using original prompt:', error);
        return rawPrompt; // Fallback to original prompt
    }
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
            ? "🔄 **Step 1/3:** Preparing to regenerate..."
            : "🎨 **Step 1/3:** Preparing your image generation...";
        statusMessage = await message.reply(statusText);

        // Keep typing indicator active
        progressInterval = setInterval(() => {
            if (supportsTyping(message.channel)) {
                message.channel.sendTyping().catch(() => {});
            }
        }, 5000);

        // Update status: Refining prompt
        await statusMessage.edit("✨ **Step 2/3:** Optimizing your prompt with AI...");
        
        // Refine the prompt using AI
        const refinedPrompt = await refinePromptForImageGeneration(promptText);

        // Prepare prompt with better structure
        const finalPrompt = `
<system_instructions>
Generate an image based on the user's creative description below.
Default Aspect Ratio: 16:9 Landscape (unless the user specifies otherwise).

ART STYLE:
- PIXEL ART aesthetic. Medium resolution (16-bit era quality).
- NOT photorealistic. NOT 3D rendered. NOT high-definition/HD/4K.

COMPOSITION & FOCUS:
- The provided reference model (3D voxel creature/object) is the MAIN FOCAL POINT.
- Position it in the CENTER of the composition.
- Make it LARGE and PROMINENT - easily visible, clearly detailed, and the primary subject that draws the eye.
- Reference model = 60% visual importance.
- Background environment = 30% visual importance (pixel art, sets mood).
- Effects/atmosphere = 10% visual importance (enhances without distracting).

INTEGRATION & POSING:
- The reference model must be naturally integrated with proper shadows, realistic lighting match, and solid grounding.
- The model should NEVER look awkward, floating, static, or pasted on.
- Pose the creature/model in a NATURAL, DYNAMIC, and LIVELY way that fits its character and the scene.
- Choose an interesting, characterful pose that makes the creature feel alive (not a stiff T-pose or static stance).
- Apply proper lighting to make the model stand out from the background.
- Camera angle: Slight 3/4 view or front view to clearly showcase the reference model.
</system_instructions>

<user_prompt>
${refinedPrompt}
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

        // Update status: Generating images
        await statusMessage.edit("🖼️ **Step 3/3:** Generating 3 image variants... (this may take 30-60 seconds)");
        
        // Call Gemini API
        console.log(`[DEBUG] Calling Gemini API with model: ${IMAGE_MODEL_NAME}`);
        const model = genAI.getGenerativeModel({ model: IMAGE_MODEL_NAME });
        
        // Generate 3 variants in parallel
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
            // Store the refined prompt so regenerations maintain quality
            imageMetadata.set(replyMessage.id, {
                prompt: refinedPrompt,
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

client.on('messageCreate', async (message: Message) => {
    // Ignore bots
    if (message.author.bot) return;

    // Check if the bot is mentioned
    if (!message.mentions.has(client.user!)) return;

    // Remove the mention from the content
    const content = message.content.replace(/<@!?[0-9]+>/g, '').trim();
    
    if (!content) {
        message.reply("Please provide a prompt to generate an image! Example: `@bot a cyberpunk scene` with a reference image attached.");
        return;
    }

    // Check if this is a reply to a bot message (for regeneration)
    if (message.reference?.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            
            // Check if replying to the bot's image generation (regeneration allowed without new reference)
            if (repliedMessage.author.id === client.user!.id && imageMetadata.has(repliedMessage.id)) {
                const metadata = imageMetadata.get(repliedMessage.id)!;
                
                // Regenerate with modified prompt and the previously generated images
                const modifiedPrompt = `${metadata.prompt}, ${content}`;
                await generateImages(message, modifiedPrompt, metadata.generatedImages || [], true);
                return;
            }
            
            // Replying to any message with attachments - use them as reference
            if (repliedMessage.attachments.size > 0) {
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
                
                if (extraAttachments.length === 0) {
                    message.reply("❌ **Reference image required!**\nPlease attach a reference image (your 3D voxel model) to your message, or reply to a message that has one.");
                    return;
                }
                
                const prompt = extractPrompt(content);
                await generateImages(message, prompt, [], false, extraAttachments);
                return;
            }
        } catch (err) {
            console.error('Error fetching replied message:', err);
        }
    }

    // Check if user attached a reference image directly
    if (message.attachments.size > 0) {
        const hasImage = Array.from(message.attachments.values()).some(att => att.contentType?.startsWith('image/'));
        if (hasImage) {
            const prompt = extractPrompt(content);
            await generateImages(message, prompt);
            return;
        }
    }

    // No reference image found - require it
    message.reply("❌ **Reference image required!**\n\nPlease provide a reference image of your 3D voxel model. You can:\n1. **Attach an image** to your message with the bot mention\n2. **Reply to a message** that has an image attached\n\nExample: `@bot create a spooky forest background` (with your model image attached)");
});

// Login
client.login(process.env.DISCORD_TOKEN);

