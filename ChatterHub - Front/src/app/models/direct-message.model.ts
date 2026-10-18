export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  senderAvatarUrl: string;
  content: string;
  createdAt: Date;
  read: boolean;
}

export interface DmConversation {
  userId: string;
  username: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
}
