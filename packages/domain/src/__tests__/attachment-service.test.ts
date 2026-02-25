import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttachmentService, type AttachmentServiceDeps } from '../attachment-service';
import type { Attachment } from '../attachment';
import type { Channel, Member } from '../server';

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    serverId: 'srv-1',
    channelId: 'ch-1',
    uploaderId: 'user-1',
    objectKey: 'srv/srv-1/uuid/file.png',
    filename: 'file.png',
    contentType: 'image/png',
    sizeBytes: 1024,
    status: 'pending',
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    serverId: 'srv-1',
    userId: 'user-1',
    role: 'MEMBER',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1',
    serverId: 'srv-1',
    name: 'general',
    type: 'text',
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<AttachmentServiceDeps> = {}): AttachmentServiceDeps {
  return {
    attachmentRepo: {
      create: vi.fn(async (_tx, att) => makeAttachment({ ...att, id: att.id })),
      findById: vi.fn(async () => makeAttachment()),
      updateStatus: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
      findByIds: vi.fn(async () => []),
      listByStatus: vi.fn(async () => []),
    },
    messageAttachmentRepo: {
      link: vi.fn(async () => {}),
      listByMessageId: vi.fn(async () => []),
    },
    memberRepo: {
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      findMember: vi.fn(async () => makeMember()),
      listByServerId: vi.fn(async () => []),
      updateRole: vi.fn(async () => {}),
    },
    channelRepo: {
      create: vi.fn(async () => makeChannel()),
      findById: vi.fn(async () => makeChannel()),
      findByServerAndName: vi.fn(async () => null),
      rename: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
      listByServerId: vi.fn(async () => []),
      countByServerId: vi.fn(async () => 1),
    },
    objectStorage: {
      generateUploadUrl: vi.fn(async () => 'https://minio.example/presigned-upload'),
      generateDownloadUrl: vi.fn(async () => 'https://minio.example/presigned-download'),
      deleteObject: vi.fn(async () => {}),
      ensureBucket: vi.fn(async () => {}),
    },
    outbox: { append: vi.fn(async () => '999') },
    generateId: vi.fn(() => 'att-5000'),
    generateUuid: vi.fn(() => 'uuid-1234'),
    withTransaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn({})),
    ...overrides,
  };
}

describe('AttachmentService', () => {
  let deps: AttachmentServiceDeps;
  let service: AttachmentService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new AttachmentService(deps);
  });

  describe('initUpload', () => {
    it('returns attachmentId and uploadUrl', async () => {
      const result = await service.initUpload('user-1', 'srv-1', 'ch-1', {
        filename: 'image.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      });

      expect(result.attachmentId).toBe('att-5000');
      expect(result.uploadUrl).toBe('https://minio.example/presigned-upload');
      expect(deps.attachmentRepo.create).toHaveBeenCalledOnce();
      expect(deps.objectStorage.generateUploadUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^srv\/srv-1\/uuid-1234\/image\.png$/),
        'image/png',
        1024,
      );
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(
        service.initUpload('user-3', 'srv-1', 'ch-1', {
          filename: 'x.png',
          contentType: 'image/png',
          sizeBytes: 100,
        }),
      ).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    });

    it('rejects if channel not found', async () => {
      (deps.channelRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(
        service.initUpload('user-1', 'srv-1', 'ch-99', {
          filename: 'x.png',
          contentType: 'image/png',
          sizeBytes: 100,
        }),
      ).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    });
  });

  describe('completeUpload', () => {
    it('updates status and appends outbox event', async () => {
      await service.completeUpload('user-1', 'att-1');

      expect(deps.attachmentRepo.updateStatus).toHaveBeenCalledWith({}, 'att-1', 'uploaded');
      expect(deps.outbox.append).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          eventType: 'ATTACHMENT_UPLOADED',
          payload: expect.objectContaining({ attachmentId: 'att-1' }),
        }),
      );
    });

    it('rejects if attachment not found', async () => {
      (deps.attachmentRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.completeUpload('user-1', 'att-99')).rejects.toMatchObject({
        kind: 'NOT_FOUND',
      });
    });

    it('rejects if not the uploader', async () => {
      (deps.attachmentRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeAttachment({ uploaderId: 'user-other' }),
      );
      await expect(service.completeUpload('user-1', 'att-1')).rejects.toMatchObject({
        kind: 'FORBIDDEN',
      });
    });

    it('rejects if status is not pending', async () => {
      (deps.attachmentRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeAttachment({ status: 'uploaded' }),
      );
      await expect(service.completeUpload('user-1', 'att-1')).rejects.toMatchObject({
        kind: 'VALIDATION',
      });
    });
  });

  describe('getDownloadUrl', () => {
    it('returns presigned URL for scanned attachment', async () => {
      (deps.attachmentRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeAttachment({ status: 'scanned' }),
      );

      const url = await service.getDownloadUrl('user-1', 'att-1');

      expect(url).toBe('https://minio.example/presigned-download');
      expect(deps.objectStorage.generateDownloadUrl).toHaveBeenCalledWith('srv/srv-1/uuid/file.png');
    });

    it('rejects non-member', async () => {
      (deps.memberRepo.findMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(service.getDownloadUrl('user-3', 'att-1')).rejects.toMatchObject({
        kind: 'FORBIDDEN',
      });
    });

    it('rejects if attachment not scanned', async () => {
      (deps.attachmentRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeAttachment({ status: 'uploaded' }),
      );
      await expect(service.getDownloadUrl('user-1', 'att-1')).rejects.toMatchObject({
        kind: 'VALIDATION',
      });
    });
  });
});
