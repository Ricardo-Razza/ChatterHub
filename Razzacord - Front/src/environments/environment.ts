export const environment = {
  production: false,
  apiUrl: '/api',
  // Mesmo origem: o proxy do ng serve encaminha /ws para a API (funciona também em HTTPS).
  wsUrl: '/ws',
  getWsEndpoint(): string {
    return this.wsUrl;
  },
  getSocketUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'localhost';
    return `ws://${host}:8080/ws`;
  }
};