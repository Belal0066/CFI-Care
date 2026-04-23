import { Routes } from '@angular/router';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';

import { authGuard } from './guards/auth.guard';
import { ChatGPT } from './chatgpt/chatgpt';
import { AppointmentTestComponent } from './appointment-test/appointment-test.component';
import { PractitionerProfileTestComponent } from './practitioner-profile-test/practitioner-profile-test.component';
import { SlotAppointmentTestComponent } from './slot-appointment-test/slot-appointment-test.component';
import {ChatSection} from './chat-section/chat-section';

export const routes: Routes = [
  // { path: '', component: Login },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'med-graph/:id', component: MedGraph, canActivate: [authGuard] },
  { path: 'chatgpt', component: ChatGPT },
  {
    path: 'appointment-test',
    component: AppointmentTestComponent,
    canActivate: [authGuard],
  },
  {
    path: 'practitioner-profile-test',
    component: PractitionerProfileTestComponent,
    canActivate: [authGuard],
  },
  {
    path: 'slot-appointment-test',
    component: SlotAppointmentTestComponent,
    canActivate: [authGuard],
  },
  {
    path: 'chat-section',
    component: ChatSection,
    canActivate: [authGuard],
  }

// export const routes: Routes = [
//   { path: '', component: Login },
//   {path:'dashboard', component: Dashboard},
//   { path: 'med-graph/:id', component: MedGraph },
//   // { path: 'chat-section', component: ChatSection },
// ];
