function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  redis: {
    url: optional("REDIS_URL", "redis://localhost:6379"),
  },
  db: {
    host: optional("DB_HOST", "localhost"),
    port: parseInt(optional("DB_PORT", "5432"), 10),
    user: optional("DB_USER", "qidian"),
    password: optional("DB_PASSWORD", ""),
    name: optional("DB_NAME", "qidian"),
    sslmode: optional("DB_SSLMODE", "disable"),
  },
  auth: {
    secret: required("AUTH_SECRET"),
    url: optional("AUTH_URL", "http://localhost:3000"),
    google: {
      clientId: optional("GOOGLE_CLIENT_ID", ""),
      clientSecret: optional("GOOGLE_CLIENT_SECRET", ""),
    },
    discord: {
      clientId: optional("DISCORD_CLIENT_ID", ""),
      clientSecret: optional("DISCORD_CLIENT_SECRET", ""),
    },
  },
  r2: {
    accessKeyId: optional("R2_ACCESS_KEY_ID", ""),
    secretAccessKey: optional("R2_SECRET_ACCESS_KEY", ""),
    endpointUrl: optional("R2_ENDPOINT_URL", ""),
    bucketName: optional("R2_BUCKET_NAME", ""),
    publicUrl: optional("R2_PUBLIC_URL", ""),
  },
} as const;

export function getDatabaseUrl(): string {
  const { host, port, user, password, name, sslmode } = env.db;
  const ssl = sslmode === "disable" ? "" : `?sslmode=${sslmode}`;
  return `postgres://${user}:${password}@${host}:${port}/${name}${ssl}`;
}
