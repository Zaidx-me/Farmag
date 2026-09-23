import { randomUUID } from 'node:crypto';
import type { UserRole } from '@poultry/shared-types';
import { uuidSchema } from '@poultry/validation';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { isFarmAccessible, requireRole } from '../../utils/farm-access.js';
import type { FilesService, MinioClientLike, PresignUploadInput } from './types.js';

const FINANCE_WRITE_ROLES: UserRole[] = ['OWNER', 'ACCOUNTANT'];
const UPLOAD_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60;
const MAX_FILE_NAME_LENGTH = 255;

/**
 * Defense-in-depth filename sanitization: normalize backslashes to forward slashes,
 * take the basename (last path segment), strip `..` sequences and leading dots, then
 * truncate to 255 chars. Guarantees the objectKey suffix can never traverse the bucket.
 */
export function sanitizeFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';
  const cleaned = basename.replace(/\.\./g, '').replace(/^\.+/, '');
  const truncated = cleaned.slice(0, MAX_FILE_NAME_LENGTH);
  return truncated.length > 0 ? truncated : 'file';
}

export function createFilesService(client: MinioClientLike): FilesService {
  return {
    async presignUpload(input: PresignUploadInput, userId: string) {
      const { fileName, farmId } = input;
      if (farmId !== undefined) {
        const { role } = await isFarmAccessible(farmId, userId);
        requireRole(role, FINANCE_WRITE_ROLES);
      }
      const sanitized = sanitizeFileName(fileName);
      const objectKey =
        farmId !== undefined
          ? `${farmId}/${randomUUID()}-${sanitized}`
          : `misc/${randomUUID()}-${sanitized}`;
      const uploadUrl = await client.presignedPutObject(env.MINIO_BUCKET, objectKey, UPLOAD_URL_TTL_SECONDS);
      return { objectKey, uploadUrl, method: 'PUT' as const };
    },

    async presignDownload(objectKey: string, userId: string) {
      const [firstSegment, ...rest] = objectKey.split('/');
      if (!firstSegment || rest.length === 0) {
        throw new ApiError('VALIDATION_ERROR', 'malformed objectKey', 400);
      }
      if (firstSegment !== 'misc') {
        if (!uuidSchema.safeParse(firstSegment).success) {
          throw new ApiError('VALIDATION_ERROR', 'malformed objectKey', 400);
        }
        await isFarmAccessible(firstSegment, userId);
      }
      const downloadUrl = await client.presignedGetObject(env.MINIO_BUCKET, objectKey, DOWNLOAD_URL_TTL_SECONDS);
      return { downloadUrl };
    },
  };
}