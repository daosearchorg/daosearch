import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  ComponentType,
} from "discord.js";

export async function sendPaginatedEmbed(
  interaction: ChatInputCommandInteraction,
  fetchPage: (page: number) => Promise<{ embed: EmbedBuilder; totalPages: number }>,
  initialPage = 1,
) {
  let page = initialPage;
  const { embed, totalPages } = await fetchPage(page);

  if (totalPages <= 1) {
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const prevId = `prev-${interaction.id}`;
  const nextId = `next-${interaction.id}`;

  function makeButtons(currentPage: number, total: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= total),
    );
  }

  const reply = await interaction.editReply({
    embeds: [embed],
    components: [makeButtons(page, totalPages)],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (btnInteraction) => {
    if (btnInteraction.customId === prevId && page > 1) page--;
    if (btnInteraction.customId === nextId && page < totalPages) page++;

    try {
      const result = await fetchPage(page);
      await btnInteraction.update({
        embeds: [result.embed],
        components: [makeButtons(page, result.totalPages)],
      });
    } catch {
      await btnInteraction.update({
        components: [makeButtons(page, totalPages)],
      });
    }
  });

  collector.on("end", async () => {
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(prevId).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(nextId).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await interaction.editReply({ components: [disabledRow] });
    } catch {}
  });
}
