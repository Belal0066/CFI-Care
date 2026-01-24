import { Routes } from '@angular/router';
import { Login } from './login/login';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';
import { ChatGPT } from './chatgpt/chatgpt';

export const routes: Routes = [
  { path: '', component: Login },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard },
  { path: 'med-graph/:id', component: MedGraph },
  { path: 'chatgpt', component: ChatGPT },
];
