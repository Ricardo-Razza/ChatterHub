import { Server } from './models/server.model';
import { Channel } from './models/channel.model';
import { User } from './models/user.model';
import { Message } from './models/message.model';

// ---------------------------------------------------------------------------
// MOCK DATA
// Substituir futuramente por chamadas HTTP/WebSocket para a API Java (Spring Boot)
// ---------------------------------------------------------------------------

export const MOCK_SERVERS: Server[] = [
  { id: 'srv-1', name: 'Guild dos Devs', initials: 'GD', hasNotification: true },
  { id: 'srv-2', name: 'Angular Brasil', initials: 'AB' },
  { id: 'srv-3', name: 'Java & Spring', initials: 'JS' },
  { id: 'srv-4', name: 'Gamers United', initials: 'GU', hasNotification: true },
  { id: 'srv-5', name: 'Design Studio', initials: 'DS' },
];

export const MOCK_USERS: User[] = [
  {
    id: 'user-me',
    username: 'voce_dev',
    avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=voce_dev&backgroundColor=5865f2',
    status: 'online',
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
  },
  {
    id: 'user-2',
    username: 'MariaCodes',
    avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=MariaCodes&backgroundColor=23a55a',
    status: 'online',
    isSpeaking: true,
    isCameraOn: true,
  },
  {
    id: 'user-3',
    username: 'PedroBackend',
    avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=PedroBackend&backgroundColor=f0b232',
    status: 'idle',
    isSpeaking: false,
  },
  {
    id: 'user-4',
    username: 'AnaFullstack',
    avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=AnaFullstack&backgroundColor=f23f43',
    status: 'dnd',
    isMuted: true,
  },
  {
    id: 'user-5',
    username: 'LucasUI',
    avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=LucasUI&backgroundColor=00a8fc',
    status: 'online',
    isSpeaking: true,
    isSharingScreen: true,
  },
  {
    id: 'user-6',
    username: 'JooBot',
    avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=JooBot&backgroundColor=949ba4',
    status: 'offline',
  },
];

export const MOCK_CHANNELS: Channel[] = [
  // Servidor 1 - Guild dos Devs
  { id: 'chan-1', serverId: 'srv-1', name: 'geral', type: 'text', unread: true },
  { id: 'chan-2', serverId: 'srv-1', name: 'introducoes', type: 'text' },
  { id: 'chan-3', serverId: 'srv-1', name: 'ajuda-angular', type: 'text', unread: true },
  { id: 'chan-4', serverId: 'srv-1', name: 'off-topic', type: 'text' },
  {
    id: 'chan-5',
    serverId: 'srv-1',
    name: 'Sala Geral',
    type: 'voice',
    connectedUserIds: ['user-2', 'user-3', 'user-5'],
  },
  {
    id: 'chan-6',
    serverId: 'srv-1',
    name: 'Sala de Estudos',
    type: 'voice',
    connectedUserIds: [],
  },
  {
    id: 'chan-7',
    serverId: 'srv-1',
    name: 'AFK',
    type: 'voice',
    connectedUserIds: ['user-6'],
  },
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'msg-1',
    channelId: 'chan-1',
    authorId: 'user-2',
    authorName: 'MariaCodes',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=MariaCodes&backgroundColor=23a55a',
    content: 'Pessoal, bom dia! Alguém já viu a nova versão do Angular com Signals? 🚀',
    createdAt: new Date(new Date().setHours(9, 12)),
  },
  {
    id: 'msg-2',
    channelId: 'chan-1',
    authorId: 'user-3',
    authorName: 'PedroBackend',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=PedroBackend&backgroundColor=f0b232',
    content: 'Bom dia! Ainda não, estou terminando a API em Spring Boot pra integrar com o front de vocês.',
    createdAt: new Date(new Date().setHours(9, 15)),
  },
  {
    id: 'msg-3',
    channelId: 'chan-1',
    authorId: 'user-3',
    authorName: 'PedroBackend',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=PedroBackend&backgroundColor=f0b232',
    content: 'Vou expor os endpoints REST e um canal WebSocket/STOMP para as mensagens em tempo real.',
    createdAt: new Date(new Date().setHours(9, 16)),
    grouped: true,
  },
  {
    id: 'msg-4',
    channelId: 'chan-1',
    authorId: 'user-4',
    authorName: 'AnaFullstack',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=AnaFullstack&backgroundColor=f23f43',
    content: 'Perfeito! Já deixei os componentes standalone prontos pra plugar o serviço de chat.',
    createdAt: new Date(new Date().setHours(9, 20)),
  },
  {
    id: 'msg-5',
    channelId: 'chan-1',
    authorId: 'user-5',
    authorName: 'LucasUI',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=LucasUI&backgroundColor=00a8fc',
    content: 'Terminei os ajustes de responsividade na sidebar. Testem em telas menores 📱',
    createdAt: new Date(new Date().setHours(9, 27)),
  },
  {
    id: 'msg-6',
    channelId: 'chan-1',
    authorId: 'user-me',
    authorName: 'voce_dev',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=voce_dev&backgroundColor=5865f2',
    content: 'Show! Vou entrar na call de voz pra alinharmos os detalhes finais 🎙️',
    createdAt: new Date(new Date().setHours(9, 30)),
  },
];
