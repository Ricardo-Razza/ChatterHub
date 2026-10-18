export const environment = {
  production: false,
  apiUrl: '/api',
  get wsUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'localhost';
    return `http://${host}:8080/ws`;
  },
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