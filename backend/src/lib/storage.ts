import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";

const s3 = new S3Client({
  region: "auto",
  endpoint: env.r2.endpointUrl,
  credentials: {
    accessKeyId: env.r2.accessKeyId,
    secretAccessKey: env.r2.secretAccessKey,
  },
});

export async function uploadAvatar(
  userId: number,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = contentType === "image/gif" ? "gif"
    : contentType === "image/png" ? "png"
    : "jpg";
  const key = `avatars/${userId}_${Date.now()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.r2.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    }),
  );

  return `${env.r2.publicUrl}/${key}`;
}

export async function deleteAvatar(url: string): Promise<void> {
  const key = url.replace(`${env.r2.publicUrl}/`, "");
  if (!key.startsWith("avatars/")) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.r2.bucketName,
      Key: key,
    }),
  );
}
