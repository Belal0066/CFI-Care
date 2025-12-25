import { Component } from '@angular/core';
import { LoginPageCards } from '../login-page-cards/login-page-cards';

@Component({
  selector: 'app-login-signup',
  imports: [LoginPageCards],
  templateUrl: './login-signup.html',
  styleUrl: './login-signup.css'
})
export class LoginSignup {
message = 'It is working!';
}
