import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function getKey() {
  const source =
    process.env.LOCAL_ENCRYPTION_KEY ||
    process.env.OPENAI_COMPATIBLE_API_KEY ||
    "novel-writer-local-only-development-key";
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecret(value: string) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(value: string) {
  if (!value) return "";
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) return "";
  const decipher = crypto.createDecipheriv(algorithm, getKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string) {
  if (!value) return "未配置";
  if (value.length <= 8) return "已配置";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
