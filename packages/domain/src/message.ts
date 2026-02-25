export interface Message {
  id: string;
  channelId: string;
  serverId: string;
  authorId: string;
  content: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}
