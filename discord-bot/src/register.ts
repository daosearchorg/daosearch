import { REST, Routes } from "discord.js";

import * as book from "./commands/book.js";
import * as rankings from "./commands/rankings.js";
import * as trending from "./commands/trending.js";
import * as stats from "./commands/stats.js";
import * as browse from "./commands/browse.js";
import * as similar from "./commands/similar.js";
import * as genres from "./commands/genres.js";
import * as booklists from "./commands/booklists.js";
import * as reviews from "./commands/reviews.js";

const allCommands = [book, browse, similar, reviews, rankings, trending, genres, booklists, stats];

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_BOT_CLIENT_ID;

if (!token || !clientId) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_BOT_CLIENT_ID are required");
  process.exit(1);
}

const rest = new REST().setToken(token);

async function main() {
  const body = allCommands.map((cmd) => cmd.data.toJSON());

  console.log(`Registering ${body.length} commands globally (up to 1hr cache)...`);
  await rest.put(Routes.applicationCommands(clientId!), { body });

  console.log("Commands registered successfully!");
}

main().catch((err) => {
  console.error("Failed to register commands:", err);
  process.exit(1);
});
