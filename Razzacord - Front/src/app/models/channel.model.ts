export type ChannelType = 'text' | 'voice' | 'announcement';

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  topic?: string | null;
  category?: string | null;
  position: number;
  /** Usuários atualmente conectados (apenas para canais de voz) */
  connectedUserIds?: string[];
  unread?: boolean;
}
