import { Client } from 'minio';
import { env } from './env.js';

export interface MinioClientOptions {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
}

export function createMinioClient(opts: MinioClientOptions = {
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
  // useSSL false — local dev MinIO (docker-compose) serves plain HTTP on :9000.
  useSSL: false,
}): Client {
  return new Client(opts);
}

export const minioClient = createMinioClient();