export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  content: string;
  createdAt: Date;
  /** Indica se é a mesma pessoa da mensagem anterior, para agrupar visualmente */
  grouped?: boolean;
}
