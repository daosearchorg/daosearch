import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as api from "../api.js";
import { rankingEmbed, errorEmbed } from "../embeds.js";
import { sendPaginatedEmbed } from "../pagination.js";

const ITEMS_PER_PAGE = 10;

const RANK_TYPE_LABELS: Record<string, string> = {
  popular: "Trending",
  new: "Rising",
  free: "Free",
  completed: "Finished",
  hall_of_fame: "All-Time",
  knowledge: "Knowledge",
};

const RANK_TYPE_CYCLE_LABELS: Record<string, Record<string, string>> = {
  popular: { "cycle-1": "< 30 Days", "cycle-2": "< 120 Days", "cycle-3": "< 300 Days", "cycle-4": "300+ Days", "cycle-5": "All Books" },
  new: { "cycle-1": "Monthly", "cycle-2": "Seasonal" },
  free: { "cycle-1": "All" },
  completed: { "cycle-1": "Latest", "cycle-2": "Overall" },
  hall_of_fame: { "cycle-1": "2021", "cycle-2": "2020", "cycle-3": "2019", "cycle-4": "2018" },
  knowledge: { "cycle-1": "All" },
};

export const data = new SlashCommandBuilder()
  .setName("rankings")
  .setDescription("Get Qidian chart rankings")
  .addStringOption((o) =>
    o.setName("type").setDescription("Ranking type").addChoices(
      { name: "Trending", value: "popular" },
      { name: "Rising", value: "new" },
      { name: "Free", value: "free" },
      { name: "Finished", value: "completed" },
      { name: "All-Time", value: "hall_of_fame" },
      { name: "Knowledge", value: "knowledge" },
    ),
  )
  .addStringOption((o) =>
    o.setName("gender").setDescription("Target audience").addChoices(
      { name: "Male", value: "male" },
      { name: "Female", value: "female" },
      { name: "Publish", value: "publish" },
    ),
  )
  .addStringOption((o) =>
    o.setName("cycle").setDescription("Time period / cycle").addChoices(
      { name: "< 30 Days", value: "cycle-1" },
      { name: "< 120 Days", value: "cycle-2" },
      { name: "< 300 Days", value: "cycle-3" },
      { name: "300+ Days", value: "cycle-4" },
      { name: "All Books", value: "cycle-5" },
    ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const gender = interaction.options.getString("gender") || "male";
  const type = interaction.options.getString("type") || "popular";
  const cycle = interaction.options.getString("cycle") || "cycle-1";

  const genderLabel = gender.charAt(0).toUpperCase() + gender.slice(1);
  const typeLabel = RANK_TYPE_LABELS[type] || type;
  const cycleLabel = RANK_TYPE_CYCLE_LABELS[type]?.[cycle] || cycle;
  const title = `${genderLabel} · ${typeLabel} · ${cycleLabel}`;

  try {
    await sendPaginatedEmbed(interaction, async (page) => {
      const result = await api.getRankings({ gender, type, cycle, page, limit: ITEMS_PER_PAGE });
      const totalPages = Math.max(1, result.pagination.totalPages);

      return {
        embed: rankingEmbed(title, result.data, page, totalPages),
        totalPages,
      };
    });
  } catch (err) {
    console.error("[/rankings]", err);
    await interaction.editReply({ embeds: [errorEmbed("Failed to fetch rankings.")] });
  }
}
