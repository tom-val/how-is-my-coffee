import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the S3 SDK before importing the module under test
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

describe('s3', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('getPhotoUrl', () => {
    it('returns a relative path in production (no S3_ENDPOINT)', async () => {
      delete process.env.S3_ENDPOINT;
      const { getPhotoUrl } = await import('./s3.js');

      expect(getPhotoUrl('uploads/photo.jpg')).toBe('/uploads/photo.jpg');
    });

    it('returns a direct MinIO URL in local dev (S3_ENDPOINT set)', async () => {
      process.env.S3_ENDPOINT = 'http://localhost:9000';
      const { getPhotoUrl } = await import('./s3.js');

      expect(getPhotoUrl('uploads/photo.jpg')).toBe(
        'http://localhost:9000/coffee-app-photos/uploads/photo.jpg',
      );

      delete process.env.S3_ENDPOINT;
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('returns a presigned URL string', async () => {
      delete process.env.S3_ENDPOINT;
      const { getPresignedUploadUrl } = await import('./s3.js');
      const url = await getPresignedUploadUrl('uploads/test.jpg', 'image/jpeg');

      expect(url).toBe('https://s3.example.com/presigned');
    });
  });
});
