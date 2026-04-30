import { Routes } from '@angular/router';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';
import {ChatSection} from './chat-section/chat-section';
import { DoctorProfileComponent } from './doctor-profile/doctor-profile';

export const routes: Routes = [
  { path: '', component: Login },
  {path:'dashboard', component: Dashboard},
  { path: 'med-graph/:id', component: MedGraph },
  // { path: 'chat-section', component: ChatSection },
  { path: 'doctor-profile', component: DoctorProfileComponent },
];


