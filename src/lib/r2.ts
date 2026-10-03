import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const BUCKET = process.env.R2_BUCKET_NAME || "artha-files";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required");
    }
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

/**
 * Upload a file to R2.
 * key format: "{projectSlug}/{userId}/{fileId}.{ext}"
 */
export async function uploadToR2(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    })
  );
}

/**
 * Generate a pre-signed URL for an R2 object.
 * Default expiry is 15 minutes — enough for Replicate to fetch the file.
 */
export async function getR2SignedUrl(key: string, expiresIn = 900): Promise<string> {
  const client = getClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

/**
 * Get a file from R2. Returns the body as a Buffer.
 */
export async function getFromR2(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const client = getClient();
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Delete a file from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
  );
}

/**
 * Get total storage used under a prefix (e.g. "{slug}/").
 * Returns size in bytes.
 */
export async function getR2StorageBytes(prefix: string): Promise<number> {
  const client = getClient();
  let totalBytes = 0;
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of response.Contents || []) {
      totalBytes += obj.Size || 0;
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return totalBytes;
}

/**
 * Delete all files under a prefix (e.g. "{slug}/").
 * Used when cleaning up after subscription expiry.
 */
export async function deleteR2Prefix(prefix: string): Promise<number> {
  const client = getClient();
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of response.Contents || []) {
      if (obj.Key) {
        await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
        deleted++;
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}
