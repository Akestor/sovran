import { type Message } from './message';

export interface MessageRepository {
  create(
    tx: unknown,
    msg: { id: string; channelId: string; serverId: string; authorId: string; content: string },
  ): Promise<Message>;

  listByChannel(
    tx: unknown,
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<Message[]>;

  softDelete(tx: unknown, id: string): Promise<void>;

  findById(tx: unknown, id: string): Promise<Message | null>;
}
