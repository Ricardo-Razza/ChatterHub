export const environment = {
  production: true,
  apiUrl: '/api',
  wsUrl: '/ws',
  getWsEndpoint(): string {
    if (this.wsUrl.startsWith('http') || this.wsUrl.startsWith('ws')) {
      return this.wsUrl;
    }
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'https:' : 'http:';
    return `${proto}//${loc.host}${this.wsUrl}`;
  },
  getSocketUrl(): string {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${loc.host}${this.wsUrl}`;
  }
};
