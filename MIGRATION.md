# Migration to TypeScript

## What Changed

### New Features ✨

1. **Smart Intent Detection**
   - No need to say "@bot generate" anymore
   - Bot automatically detects if you want an image or text conversation
   - Keywords like "generate", "create", "draw", "image", etc. trigger image generation
   - Everything else starts a text conversation

2. **Reply-to-Image Regeneration**
   - Reply to any image the bot generated
   - Add your modifications (e.g., "make it pink", "add mountains")
   - Bot regenerates BOTH variants with the changes applied

3. **AI Text Conversations**
   - Have natural conversations with the bot
   - Reply to bot's text messages to continue the conversation with context
   - Full conversation history maintained per thread

4. **TypeScript**
   - Better type safety
   - Improved development experience
   - Catches errors at compile time

### File Structure

**Before:**
```
image generator/
├── index.js
├── package.json
└── .env
```

**After:**
```
image generator/
├── src/
│   └── index.ts      (TypeScript source)
├── dist/
│   └── index.js      (Compiled JavaScript)
├── tsconfig.json     (TypeScript config)
├── package.json      (Updated with TS deps)
└── .env
```

### Commands

**Before:**
```bash
npm start              # Run the bot
```

**After:**
```bash
npm run build          # Compile TypeScript
npm start              # Run the compiled bot
npm run dev            # Build and run in one command
npm run watch          # Auto-rebuild on changes
```

## How to Use New Features

### Example 1: Simple Image Generation
```
User: @Bot a cyberpunk city
Bot: [Generates 2 image variants]
```

### Example 2: Image Regeneration
```
User: @Bot a dog
Bot: [Generates 2 images of a dog]

User: [Replies to bot's image] make it a golden retriever
Bot: [Regenerates both variants as golden retrievers]

User: [Replies again] add a beach background
Bot: [Regenerates with "a golden retriever, add a beach background"]
```

### Example 3: Text Conversation
```
User: @Bot what is photosynthesis?
Bot: [Explains photosynthesis]

User: [Replies to bot's message] can you simplify that?
Bot: [Gives simpler explanation with context]

User: [Replies again] give me an analogy
Bot: [Provides analogy with full context]
```

### Example 4: Mixed Usage
```
User: @Bot tell me about dogs
Bot: [Text response about dogs]

User: @Bot now draw me a corgi
Bot: [Generates 2 corgi images]

User: [Replies to corgi image] wearing a crown
Bot: [Regenerates corgi with crown]
```

## Technical Changes

### New Dependencies
- `typescript` - TypeScript compiler
- `@types/node` - Node.js type definitions

### New Data Structures
- **Conversation History**: Maps message IDs to conversation arrays
- **Image Metadata**: Stores original prompts and reference images for regeneration

### Memory Management
- Histories stored in-memory (will reset on bot restart)
- Consider implementing persistent storage for production use

## Known Limitations

1. **Memory Resets**: Conversation history and image metadata are lost when bot restarts
2. **In-Memory Storage**: Not suitable for high-traffic scenarios without database
3. **API Quotas**: Heavy usage may hit Google AI API limits

## Future Improvements

- [ ] Add persistent storage (database)
- [ ] Add conversation cleanup/expiration
- [ ] Add admin commands to manage conversations
- [ ] Add image history browsing
- [ ] Add support for more AI models
- [ ] Add rate limiting per user

## Troubleshooting

### Build Errors
If you get TypeScript errors:
```bash
npm run build
```
Check the error messages for details.

### Bot Not Responding
1. Make sure you built the project: `npm run build`
2. Check the .env file has both tokens
3. Verify bot permissions in Discord

### Old JavaScript File
The old `index.js` is still there but not used. You can delete it if you want:
```bash
# Optional: remove old file
rm index.js
```

## Development Workflow

1. Make changes to `src/index.ts`
2. Build: `npm run build`
3. Run: `npm start`

Or use the watch command for continuous development:
```bash
npm run watch       # Terminal 1 - auto rebuilds
npm start          # Terminal 2 - run bot
```

