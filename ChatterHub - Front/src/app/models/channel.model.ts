export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  /** Usuários atualmente conectados (apenas para canais de voz) */
  connectedUserIds?: string[];
  unread?: boolean;
}
