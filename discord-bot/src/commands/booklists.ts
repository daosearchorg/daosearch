import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { booklistsEmbed, errorEmbed } from "../embeds.js";
import { sendPaginatedEmbed } from "../pagination.js";

const ITEMS_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName("booklists")
  .setDescription("Browse curated Qidian booklists")
  .addStringOption((o) =>
    o.setName("sort").setDescription("Sort order").addChoices(
      { name: "Popular", value: "popular" },
      { name: "Recent", value: "recent" },
      { name: "Largest", value: "largest" },
    ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sort = interaction.options.getString("sort") || "popular";

  try {
    await sendPaginatedEmbed(interaction, async (page) => {
      const result = await api.getBooklists({ sort, page, limit: ITEMS_PER_PAGE });
      const totalPages = Math.max(1, result.pagination.totalPages);

      return {
        embed: booklistsEmbed(result.data, page, totalPages),
        totalPages,
      };
    });
  } catch (err) {
    console.error("[/booklists]", err);
    await interaction.editReply({ embeds: [errorEmbed("Failed to fetch booklists.")] });
  }
}
