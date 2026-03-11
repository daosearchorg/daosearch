import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { statsEmbed, errorEmbed } from "../embeds.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("Get DaoSearch database statistics");

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const result = await api.getStats();
    await interaction.editReply({ embeds: [statsEmbed(result.data)] });
  } catch {
    await interaction.editReply({ embeds: [errorEmbed("Failed to fetch stats.")] });
  }
}
