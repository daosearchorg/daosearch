import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "qidian",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "qidian",
    ssl: process.env.DB_SSLMODE === "disable" ? false : true,
  },
});
