import { Routes } from '@angular/router';
import { Dashboard } from './dashboard/dashboard';
import { ChatSection } from './chat-section/chat-section';
import { DoctorProfileComponent } from './doctor-profile/doctor-profile';
import { GrantActiveComponent } from './grant-active/grant-active';
import { GrantPendingComponent } from './grant-pending/grant-pending';
import { GatewayErrorComponent } from './gateway-error/gateway-error';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
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
  {
    path: 'error/:status',
    component: GatewayErrorComponent,
  },
];
