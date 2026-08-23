import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-area/main-area.component').then((m) => m.MainAreaComponent),
  },
];
