import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { bookEmbed, errorEmbed } from "../embeds.js";
import { resolveBookId } from "../resolve-book.js";

export const data = new SlashCommandBuilder()
  .setName("book")
  .setDescription("Get book details by ID or name")
  .addStringOption((o) => o.setName("query").setDescription("Book ID or name (original/translated)").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);
  const bookId = await resolveBookId(interaction, query);
  if (!bookId) return;

  try {
    const result = await api.getBook(bookId);
    await interaction.editReply({ embeds: [bookEmbed(result.data)] });
  } catch (err) {
    console.error("[/book]", err);
    if (err instanceof api.ApiError && err.status === 404) {
      await interaction.editReply({ embeds: [errorEmbed(`Book #${bookId} not found.`)] });
    } else {
      await interaction.editReply({ embeds: [errorEmbed("Failed to fetch book details.")] });
    }
  }
}
