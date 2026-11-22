export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  content: string;
  systemMessage?: boolean;
  createdAt: Date;
  /** Indica se é a mesma pessoa da mensagem anterior, para agrupar visualmente */
  grouped?: boolean;
  /** Indica se a mensagem foi editada */
  edited?: boolean;
  /** Indica se a mensagem foi deletada (soft delete) */
  deleted?: boolean;
  /** URL ou base64 de anexo (imagem ou documento) */
  attachmentUrl?: string;
  attachmentType?: 'image' | 'file';
  attachmentName?: string;
}
