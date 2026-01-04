
import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction, 
    AutocompleteInteraction, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType
} from 'discord.js';
import { CONFIG_DEFAULTS, ConfigKey, fetchConfig, updateConfig, Env } from '../config-service.js';

export const data = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Manage configuration')
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View current configuration')
            .addStringOption(option =>
                option.setName('env')
                    .setDescription('Environment to view')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Dev', value: 'Dev' },
                        { name: 'Prod', value: 'Prod' }
                    )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('edit')
            .setDescription('Edit a configuration value')
            .addStringOption(option =>
                option.setName('env')
                    .setDescription('Environment to edit')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Dev', value: 'Dev' },
                        { name: 'Prod', value: 'Prod' }
                    )
            )
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('Configuration key')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('value')
                    .setDescription('New value')
                    .setRequired(true)
            )
    );

export async function autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused();
    const keys = Object.keys(CONFIG_DEFAULTS);
    const filtered = keys.filter(choice => choice.startsWith(focusedValue)).slice(0, 25);
    await interaction.respond(
        filtered.map(choice => ({ name: choice, value: choice }))
    );
}

export async function execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const env = interaction.options.getString('env', true) as Env;

    if (subcommand === 'view') {
        await handleView(interaction, env);
    } else if (subcommand === 'edit') {
        await handleEdit(interaction, env);
    }
}

async function handleView(interaction: ChatInputCommandInteraction, env: Env) {
    await interaction.deferReply();

    try {
        const result = await fetchConfig(env);
        
        // Validate configs exists
        if (!result || !result.configs || typeof result.configs !== 'object') {
            throw new Error(`Invalid response: configs property is missing or invalid`);
        }
        
        const { configs } = result;
        
        // Group by category
        const categories = new Map<string, string[]>();
        
        for (const [key, value] of Object.entries(configs)) {
            const [category] = key.split('.');
            const entry = `\`${key}\`: ${formatValue(value)}`;
            
            if (!categories.has(category)) {
                categories.set(category, []);
            }
            categories.get(category)!.push(entry);
        }

        const embed = new EmbedBuilder()
            .setTitle(`Configuration: ${env}`)
            .setColor(env === 'Prod' ? 0xFF0000 : 0x00FF00) // Red for Prod, Green for Dev
            .setTimestamp();

        for (const [category, entries] of categories) {
            embed.addFields({
                name: category.toUpperCase(),
                value: entries.join('\n') || 'No configs',
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
        await interaction.editReply({ 
            content: `Failed to fetch config: ${error.message}` 
        });
    }
}

async function handleEdit(interaction: ChatInputCommandInteraction, env: Env) {
    const key = interaction.options.getString('key', true) as ConfigKey;
    const valueStr = interaction.options.getString('value', true);

    // Validate key
    if (!(key in CONFIG_DEFAULTS)) {
        await interaction.reply({ 
            content: `Invalid config key: \`${key}\``, 
            ephemeral: true 
        });
        return;
    }

    // Parse value
    let value: any = valueStr;
    const defaultValue = CONFIG_DEFAULTS[key];
    const expectedType = typeof defaultValue;

    try {
        if (expectedType === 'number') {
            value = Number(valueStr);
            if (isNaN(value)) throw new Error('Not a number');
        } else if (expectedType === 'boolean') {
            if (valueStr.toLowerCase() === 'true') value = true;
            else if (valueStr.toLowerCase() === 'false') value = false;
            else throw new Error('Not a boolean');
        }
        // Strings remain strings
    } catch {
        await interaction.reply({
            content: `Invalid value type for \`${key}\`. Expected \`${expectedType}\`.`,
            ephemeral: true
        });
        return;
    }

    const confirmButton = new ButtonBuilder()
        .setCustomId('confirm')
        .setLabel('Confirm Change')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

    const embed = new EmbedBuilder()
        .setTitle(`Confirm Configuration Change (${env})`)
        .setColor(0xFFFF00) // Yellow for warning
        .addFields(
            { name: 'Key', value: `\`${key}\``, inline: true },
            { name: 'New Value', value: `\`${value}\``, inline: true },
            { name: 'Type', value: `\`${expectedType}\``, inline: true }
        );

    const response = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true
    });

    try {
        const confirmation = await response.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: i => i.user.id === interaction.user.id,
            time: 30000
        });

        if (confirmation.customId === 'confirm') {
            await confirmation.update({ content: 'Updating...', components: [] });
            
            try {
                await updateConfig(env, { [key]: value });
                const successEmbed = new EmbedBuilder()
                    .setTitle('Configuration Updated')
                    .setColor(0x00FF00)
                    .setDescription(`Successfully updated \`${key}\` to \`${value}\` in ${env}.`)
                    .setTimestamp();
                
                await confirmation.editReply({ content: null, embeds: [successEmbed] });
            } catch (error: any) {
                await confirmation.editReply({ 
                    content: `Failed to update config: ${error.message}` 
                });
            }
        } else {
            await confirmation.update({ content: 'Operation cancelled.', embeds: [], components: [] });
        }
    } catch (e) {
        await interaction.editReply({ content: 'Confirmation timed out.', embeds: [], components: [] });
    }
}

function formatValue(value: any): string {
    if (typeof value === 'boolean') {
        return value ? '✅' : '❌'; // Or just true/false
    }
    return String(value);
}
