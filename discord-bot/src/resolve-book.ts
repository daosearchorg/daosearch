import type { ChatInputCommandInteraction } from "discord.js";
import * as api from "./api.js";
import { searchEmbed, errorEmbed } from "./embeds.js";

/**
 * Resolve a query (ID or name) to a book ID.
 * Returns the book ID if resolved, or null if multiple results were shown / not found.
 */
export async function resolveBookId(
  interaction: ChatInputCommandInteraction,
  query: string,
): Promise<number | null> {
  const trimmed = query.trim();

  // Numeric ID
  const asNumber = Number(trimmed);
  if (!isNaN(asNumber) && asNumber > 0 && Number.isInteger(asNumber)) {
    return asNumber;
  }

  // Name search
  try {
    const result = await api.search(trimmed);
    if (result.data.length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(`No books found for "${trimmed}".`)] });
      return null;
    }

    const first = result.data[0];
    const q = trimmed.toLowerCase();
    const isExact =
      first.title?.toLowerCase() === q ||
      first.titleTranslated?.toLowerCase() === q;

    if (result.data.length === 1 || isExact) {
      return first.id;
    }

    // Multiple results — show list
    await interaction.editReply({ embeds: [searchEmbed(trimmed, result.data)] });
    return null;
  } catch {
    await interaction.editReply({ embeds: [errorEmbed("Failed to search for book.")] });
    return null;
  }
}
