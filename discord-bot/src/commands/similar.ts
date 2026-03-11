import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { similarEmbed, errorEmbed } from "../embeds.js";
import { resolveBookId } from "../resolve-book.js";

export const data = new SlashCommandBuilder()
  .setName("similar")
  .setDescription("Get similar book recommendations")
  .addStringOption((o) => o.setName("query").setDescription("Book ID or name").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);
  const bookId = await resolveBookId(interaction, query);
  if (!bookId) return;

  try {
    const [bookResult, recsResult] = await Promise.all([
      api.getBook(bookId),
      api.getBookRecommendations(bookId),
    ]);

    const bookTitle = bookResult.data.titleTranslated || bookResult.data.title;
    await interaction.editReply({ embeds: [similarEmbed(bookTitle, recsResult.data)] });
  } catch (err) {
    console.error("[/similar]", err);
    if (err instanceof api.ApiError && err.status === 404) {
      await interaction.editReply({ embeds: [errorEmbed(`Book #${bookId} not found.`)] });
    } else {
      await interaction.editReply({ embeds: [errorEmbed("Failed to fetch recommendations.")] });
    }
  }
}
