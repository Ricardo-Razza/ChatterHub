import { PresenceStatus } from './user.model';

export const PERM = {
  CREATE_INVITE: 1,
  MANAGE_CHANNELS: 2,
  MANAGE_SERVER: 4,
  MANAGE_MESSAGES: 8,
  KICK_MEMBERS: 16,
  MUTE_MEMBERS: 32,
  STREAM: 64,
  MANAGE_ROLES: 128,
} as const;

export const PERM_LABELS: { bit: number; label: string }[] = [
  { bit: PERM.CREATE_INVITE, label: 'Criar convites' },
  { bit: PERM.MANAGE_CHANNELS, label: 'Gerenciar canais' },
  { bit: PERM.MANAGE_SERVER, label: 'Gerenciar servidor' },
  { bit: PERM.MANAGE_MESSAGES, label: 'Gerenciar mensagens' },
  { bit: PERM.KICK_MEMBERS, label: 'Expulsar membros' },
  { bit: PERM.MUTE_MEMBERS, label: 'Silenciar membros' },
  { bit: PERM.STREAM, label: 'Transmitir tela/câmera' },
  { bit: PERM.MANAGE_ROLES, label: 'Gerenciar cargos' },
];

export interface ServerRole {
  id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
}

export interface ServerMember {
  id: string;
  username: string;
  avatarUrl: string;
  status: PresenceStatus;
  owner: boolean;
  roleIds: string[];
}
