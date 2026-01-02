# AI Image Generator & Chat Bot

A Discord bot powered by Google's Gemini AI that can generate images and have intelligent conversations.

## Features

### 🎨 Image Generation
- **Smart Detection**: Automatically detects when you want to generate an image (no need to say "generate")
- **2 Variants**: Generates 2 different variants of each image
- **Reference Images**: Attach images to your message to use as references
- **Image Regeneration**: Reply to generated images with modifications to regenerate them

### 💬 AI Text Conversations
- **Intelligent Chat**: Have natural conversations with the AI
- **Conversation Threading**: Reply to the bot's messages to continue the conversation with context
- **Context Aware**: The bot remembers your conversation history

## Usage Examples

### Image Generation

Simply mention the bot with what you want:

```
@Bot a futuristic city at sunset
@Bot create a cute cat wearing a hat
@Bot draw a mountain landscape
```

The bot automatically detects you want an image based on keywords like: generate, create, make, draw, image, picture, etc.

### Image Regeneration (Reply-to-Image)

1. Generate an image:
   ```
   @Bot Generate an image of a dog
   ```

2. Reply to the bot's generated image with modifications:
   ```
   make it pink
   ```

3. The bot will regenerate **both variants** with your modifications applied!

### Text Conversations

Just mention the bot without image-related keywords:

```
@Bot What's the weather like on Mars?
@Bot Tell me a joke
@Bot Explain quantum computing
```

### Threaded Conversations

Reply to any of the bot's text responses to continue the conversation:

```
User: @Bot What is machine learning?
Bot: [Explains machine learning]
User: [Replies to bot's message] Can you give me an example?
Bot: [Continues with context from previous message]
```

## Setup

### Prerequisites
- Node.js 18+
- Discord Bot Token
- Google AI API Key (Gemini)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   GOOGLE_API_KEY=your_google_ai_api_key
   ```

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

4. Start the bot:
   ```bash
   npm start
   ```

### Development

Watch for changes and auto-rebuild:
```bash
npm run watch
```

Run in development mode:
```bash
npm run dev
```

## Technical Details

- **Language**: TypeScript
- **Discord Library**: discord.js v14
- **AI Provider**: Google Generative AI (Gemini)
- **Image Model**: gemini-3-pro-image-preview
- **Text Model**: gemini-1.5-pro

## How It Works

### Auto-Detection
The bot analyzes your message for keywords to determine if you want:
- **Image Generation**: Keywords like "generate", "create", "draw", "image", "picture", etc.
- **Text Chat**: Everything else

### Conversation Memory
- Each conversation thread maintains its own history
- When you reply to a bot message, it uses that conversation's context
- Histories are stored in-memory (resets on bot restart)

### Image Regeneration
- When you generate images, the bot stores the original prompt and reference images
- When you reply to that image message, it combines the original prompt with your modifications
- Both variants are regenerated with the updated prompt

## Notes

- The bot requires the `MessageContent` intent to read message content
- Message Partials are enabled to support replying to older messages
- Image generation uses a 16:9 landscape aspect ratio by default
- You can override the aspect ratio by specifying it in your prompt

## Troubleshooting

### "Quota Exceeded" Error
This usually means:
1. You're using a free tier API key with a model that requires billing
2. You've hit your daily/monthly quota
3. Check your Google AI Studio billing settings

### Bot Doesn't Respond
1. Ensure you're mentioning the bot (@Bot)
2. Check the bot has permission to read and send messages in the channel
3. Verify the bot is online in Discord

### TypeScript Errors
Run the build command to see detailed errors:
```bash
npm run build
```
