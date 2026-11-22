import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
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
    redirectTo: '',
  },
];
