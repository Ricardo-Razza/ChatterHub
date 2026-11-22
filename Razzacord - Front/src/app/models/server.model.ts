export interface Server {
  id: string;
  name: string;
  iconUrl?: string;
  /** Iniciais usadas quando não há ícone de imagem */
  initials?: string;
  hasNotification?: boolean;
}
