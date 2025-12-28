import { Routes } from '@angular/router';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';

export const routes: Routes = [
  { path: '', component: Login },
  {path:'dashboard', component: Dashboard},
  { path: 'med-graph/:id', component: MedGraph },
];


