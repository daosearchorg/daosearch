import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { genresEmbed, errorEmbed } from "../embeds.js";

export const data = new SlashCommandBuilder()
  .setName("genres")
  .setDescription("List all available genres");

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const result = await api.getGenres();
    await interaction.editReply({ embeds: [genresEmbed(result.data)] });
  } catch {
    await interaction.editReply({ embeds: [errorEmbed("Failed to fetch genres.")] });
  }
}
