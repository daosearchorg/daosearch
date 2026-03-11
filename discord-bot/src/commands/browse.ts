import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { bookListEmbed, errorEmbed } from "../embeds.js";
import { sendPaginatedEmbed } from "../pagination.js";
import { GENRE_CHOICES } from "../genres.js";

const ITEMS_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName("browse")
  .setDescription("Browse the book library")
  .addStringOption((o) => o.setName("query").setDescription("Search by title"))
  .addStringOption((o) =>
    o.setName("genre").setDescription("Filter by genre").addChoices(...GENRE_CHOICES),
  )
  .addStringOption((o) =>
    o.setName("sort").setDescription("Sort by").addChoices(
      { name: "Recently Updated", value: "updated" },
      { name: "Newest", value: "newest" },
      { name: "Popularity", value: "popularity" },
      { name: "QQ Score", value: "qq_score" },
      { name: "Community Score", value: "community_score" },
      { name: "Word Count", value: "word_count" },
    ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query") ?? undefined;
  const genreStr = interaction.options.getString("genre");
  const genre = genreStr ? Number(genreStr) : undefined;
  const sort = interaction.options.getString("sort") || "updated";

  const genreName = genreStr ? GENRE_CHOICES.find((g) => g.value === genreStr)?.name : undefined;
  const title = query
    ? `Browse: "${query}"${genreName ? ` · ${genreName}` : ""}`
    : genreName ? `Browse: ${genreName}` : "Browse Library";

  try {
    await sendPaginatedEmbed(interaction, async (page) => {
      const result = await api.getBooks({ q: query, genre, sort, page, limit: ITEMS_PER_PAGE });
      const totalPages = Math.max(1, result.pagination.totalPages);

      return {
        embed: bookListEmbed(title, result.data, page, totalPages),
        totalPages,
      };
    });
  } catch (err) {
    console.error("[/browse]", err);
    await interaction.editReply({ embeds: [errorEmbed("Failed to browse books.")] });
  }
}
