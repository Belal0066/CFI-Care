import { Routes } from '@angular/router';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';
import { authGuard } from './guards/auth.guard';
import { ChatGPT } from './chatgpt/chatgpt';
import { AppointmentTestComponent } from './appointment-test/appointment-test.component';

export const routes: Routes = [
  { path: '', component: Login },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'med-graph/:id', component: MedGraph, canActivate: [authGuard] },
  { path: 'chatgpt', component: ChatGPT },
  {
    path: 'appointment-test',
    component: AppointmentTestComponent,
    canActivate: [authGuard],
  },
];
