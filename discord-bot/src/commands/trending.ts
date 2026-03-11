import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { rankingEmbed, errorEmbed } from "../embeds.js";
import { sendPaginatedEmbed } from "../pagination.js";
import { GENRE_CHOICES } from "../genres.js";

const ITEMS_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName("trending")
  .setDescription("Get community rankings based on reader activity")
  .addStringOption((o) =>
    o.setName("period").setDescription("Time period").addChoices(
      { name: "Daily", value: "daily" },
      { name: "Weekly", value: "weekly" },
      { name: "Monthly", value: "monthly" },
      { name: "All Time", value: "all-time" },
    ),
  )
  .addStringOption((o) =>
    o.setName("genre").setDescription("Filter by genre").addChoices(...GENRE_CHOICES),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const period = interaction.options.getString("period") || "all-time";
  const genreStr = interaction.options.getString("genre");
  const genre = genreStr ? Number(genreStr) : undefined;

  const genreName = genreStr ? GENRE_CHOICES.find((g) => g.value === genreStr)?.name : undefined;
  const title = `Trending · ${period.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}${genreName ? ` · ${genreName}` : ""}`;

  try {
    await sendPaginatedEmbed(interaction, async (page) => {
      const result = await api.getCommunityRankings({ period, genre, page, limit: ITEMS_PER_PAGE });
      const totalPages = Math.max(1, result.pagination.totalPages);

      return {
        embed: rankingEmbed(title, result.data, page, totalPages),
        totalPages,
      };
    });
  } catch (err) {
    console.error("[/trending]", err);
    await interaction.editReply({ embeds: [errorEmbed("Failed to fetch community rankings.")] });
  }
}
