export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';
export type UserRole = 'ADMIN' | 'MODERATOR' | 'MEMBER';

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  ageGroup?: string;
  birthDate?: string;
  avatarUrl: string;
  status: PresenceStatus;
  role?: UserRole;
  emailVerified?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  isSpeaking?: boolean;
  isCameraOn?: boolean;
  isSharingScreen?: boolean;
}