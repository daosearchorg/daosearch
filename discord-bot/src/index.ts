import { Client, Collection, GatewayIntentBits, type ChatInputCommandInteraction } from "discord.js";
import { errorEmbed } from "./embeds.js";

// Import commands
import * as book from "./commands/book.js";
import * as rankings from "./commands/rankings.js";
import * as trending from "./commands/trending.js";
import * as stats from "./commands/stats.js";
import * as browse from "./commands/browse.js";
import * as similar from "./commands/similar.js";
import * as genres from "./commands/genres.js";
import * as booklists from "./commands/booklists.js";
import * as reviews from "./commands/reviews.js";

interface Command {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();
const allCommands: Command[] = [book, browse, similar, reviews, rankings, trending, genres, booklists, stats];

for (const cmd of allCommands) {
  commands.set(cmd.data.name, cmd);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", (c) => {
  console.log(`Logged in as ${c.user.tag} — ${commands.size} commands loaded`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  await interaction.deferReply();

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    try {
      await interaction.editReply({ embeds: [errorEmbed("Something went wrong. Try again later.")] });
    } catch {}
  }
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is required");
  process.exit(1);
}

client.login(token);
