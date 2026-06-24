import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3StorageAdapter {
  private readonly s3;

  constructor(
    private opts: {
      credentials?:
        | {
            accessKeyId: string;
            secretAccessKey: string;
          }
        | undefined;
      endpoint: string;
      bucketName: string;
      forcePathStyle?: boolean | undefined;
    },
  ) {
    const { credentials, ...rest } = opts;
    this.s3 = new S3Client({
      ...rest,
      ...(credentials && { credentials }),
      forcePathStyle: rest.forcePathStyle ?? false,
    });
  }

  public async getMetadata(filePath: string): Promise<{
    contentType: string;
    contentLength: number;
    eTag: string;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.opts.bucketName,
        Key: filePath,
      });
      const response = await this.s3.send(command);
      if (!response.ContentType || !response.ContentLength || !response.ETag) {
        throw new Error("Failed to get metadata");
      }

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        eTag: response.ETag,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to get metadata");
    }
  }

  public async getSignedDownloadUrl(args: {
    key: string;
    contentType: string;
    eTag?: string;
    expiresIn?: number;
    filename?: string;
  }): Promise<string> {
    return await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.opts.bucketName,
        Key: args.key,
        IfMatch: args.eTag,
        ResponseContentType: args.contentType,
        ResponseContentDisposition: args.filename
          ? `attachment; filename="${args.filename}"`
          : undefined,
      }),
      { expiresIn: args.expiresIn ?? 60 * 60 },
    );
  }

  public async getSignedUploadUrl(args: {
    key: string;
    contentType?: string;
    contentLength?: number;
    expiresIn?: number;
    allowOverwriteExistingFile?: boolean;
  }): Promise<string> {
    const putCommandInput: PutObjectCommandInput = {
      Bucket: this.opts.bucketName,
      Key: args.key,
    };
    if (args.contentType) {
      putCommandInput.ContentType = args.contentType;
    }
    if (args.contentLength) {
      putCommandInput.ContentLength = args.contentLength;
    }
    if (args.allowOverwriteExistingFile !== true) {
      putCommandInput.IfNoneMatch = "*";
    }
    return await getSignedUrl(this.s3, new PutObjectCommand(putCommandInput), {
      expiresIn: args.expiresIn ?? 60,
    });
  }

  public async uploadFile(
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.opts.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      const response = await this.s3.send(command);
      const etag = response.ETag;
      if (!etag) {
        throw new Error("Failed to retrieve ETag");
      }
      return etag;
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to upload file");
    }
  }

  public async downloadFile(
    key: string,
    range?: { start: number; end?: number | undefined },
  ): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.opts.bucketName,
        Key: key,
        Range: range
          ? `bytes=${range.start.toString()}-${range.end?.toString() ?? ""}`
          : undefined,
      });
      const response = await this.s3.send(command);
      if (!response.Body) {
        throw new Error("Failed to download file");
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to download file");
    }
  }

  public async listObjects(
    prefix: string,
  ): Promise<Array<{ key: string; lastModified: Date | undefined }>> {
    const command = new ListObjectsV2Command({
      Bucket: this.opts.bucketName,
      Prefix: prefix,
    });
    const response = await this.s3.send(command);
    return (response.Contents ?? [])
      .filter((obj): obj is { Key: string; LastModified?: Date } => !!obj.Key)
      .map((obj) => ({
        key: obj.Key,
        lastModified: obj.LastModified,
      }));
  }

  public async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.opts.bucketName,
      Key: key,
    });
    await this.s3.send(command);
  }
}
