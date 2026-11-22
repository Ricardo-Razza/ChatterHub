export interface Server {
  id: string;
  name: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  accentColor?: string | null;
  systemChannelId?: string | null;
  /** Iniciais usadas quando não há ícone de imagem */
  initials?: string;
  hasNotification?: boolean;
}
