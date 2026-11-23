import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-area/main-area.component').then((m) => m.MainAreaComponent),
  },
  {
    path: 'convite/:code',
    loadComponent: () =>
      import('./layout/invite-page/invite-page.component').then((m) => m.InvitePageComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./layout/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
