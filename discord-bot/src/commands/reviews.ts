import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { opinionsEmbed, errorEmbed } from "../embeds.js";
import { sendPaginatedEmbed } from "../pagination.js";
import { resolveBookId } from "../resolve-book.js";

export const data = new SlashCommandBuilder()
  .setName("reviews")
  .setDescription("Get reviews and comments for a book")
  .addStringOption((o) => o.setName("query").setDescription("Book ID or name").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);
  const bookId = await resolveBookId(interaction, query);
  if (!bookId) return;

  try {
    const bookResult = await api.getBook(bookId);
    const bookTitle = bookResult.data.titleTranslated || bookResult.data.title;

    await sendPaginatedEmbed(interaction, async (page) => {
      const [reviewsResult, commentsResult] = await Promise.all([
        api.getBookReviews(bookId, page),
        api.getBookComments(bookId, page),
      ]);

      const totalPages = Math.max(
        reviewsResult.pagination.totalPages,
        commentsResult.pagination.totalPages,
        1,
      );

      return {
        embed: opinionsEmbed(
          bookTitle,
          reviewsResult.data,
          commentsResult.data,
          page,
          totalPages,
        ),
        totalPages,
      };
    });
  } catch (err) {
    console.error("[/reviews]", err);
    if (err instanceof api.ApiError && err.status === 404) {
      await interaction.editReply({ embeds: [errorEmbed(`Book #${bookId} not found.`)] });
    } else {
      await interaction.editReply({ embeds: [errorEmbed("Failed to fetch reviews.")] });
    }
  }
}
