import { Routes } from '@angular/router';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';
import { authGuard } from './guards/auth.guard';
import { ChatSection } from './chat-section/chat-section';
import { DoctorProfileComponent } from './doctor-profile/doctor-profile';
import { GrantPendingComponent } from './grant-pending/grant-pending';
import { GrantActiveComponent } from './grant-active/grant-active';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'med-graph/:id', component: MedGraph, canActivate: [authGuard] },
  {
    path: 'chat-section',
    component: ChatSection,
    canActivate: [authGuard],
  },
  {
    path: 'doctor-profile',
    component: DoctorProfileComponent,
    canActivate: [authGuard],
  },
  {
    path: 'grants/pending',
    component: GrantPendingComponent,
    canActivate: [authGuard],
  },
  {
    path: 'grants/active',
    component: GrantActiveComponent,
    canActivate: [authGuard],
  },
];
