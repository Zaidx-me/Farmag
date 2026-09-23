export interface MinioClientLike {
  presignedPutObject(bucketName: string, objectName: string, expires?: number): Promise<string>;
  presignedGetObject(bucketName: string, objectName: string, expires?: number): Promise<string>;
}

export interface PresignUploadInput {
  fileName: string;
  contentType: string;
  farmId?: string;
}

export interface PresignUploadResult {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
}

export interface PresignDownloadResult {
  downloadUrl: string;
}

export interface FilesService {
  presignUpload(input: PresignUploadInput, userId: string): Promise<PresignUploadResult>;
  presignDownload(objectKey: string, userId: string): Promise<PresignDownloadResult>;
}