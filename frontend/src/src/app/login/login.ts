import { Component } from '@angular/core';
import { LoginPageCards } from '../login-page-cards/login-page-cards';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LoginPageCards, FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  mode: 'login' | 'signup' = 'login';
  showForgot = false;

  email = '';
  password = '';
  rememberMe = false;

  // signup-only fields
  fullName = '';
  confirmPassword = '';

  // forgot password field
  forgotEmail = '';
  forgotMessage = '';

  constructor(private router: Router) {
    this.loadRememberedUser();
  }

  /** FORM SUBMIT */
  onSubmit() {
    if (this.showForgot) return this.sendReset(); // handle forgot panel submit

    if (this.mode === 'login') {
      this.login();
    } else {
      this.signup();
    }
  }

  /** LOG IN */
  login() {
    if (!this.email || !this.password) return;

    // Simple login - just navigate to dashboard
    this.handleRememberMe();
    this.router.navigate(['/dashboard']);
  }

  /** SIGNUP */
  signup() {
    if (
      !this.email ||
      !this.password ||
      !this.fullName ||
      this.password !== this.confirmPassword
    )
      return;
    const signupSuccess = true; // replace with backend call

    if (signupSuccess) {
      this.handleRememberMe();
      this.router.navigate(['/dashboard']);
    }
  }

  /** REMEMBER ME */
  handleRememberMe() {
    if (this.rememberMe) {
      localStorage.setItem('rememberedEmail', this.email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }
  }

  loadRememberedUser() {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      this.email = savedEmail;
      this.rememberMe = true;
    }
  }

  /** TOGGLE MODE */
  toggleMode() {
    this.mode = this.mode === 'login' ? 'signup' : 'login';
    this.showForgot = false; // hide forgot panel when toggling
  }

  /** FORGOT PASSWORD */
  forgotPassword() {
    this.showForgot = !this.showForgot;
    this.forgotMessage = '';
    this.forgotEmail = this.email; // prefill if possible
  }

  sendReset() {
    if (!this.forgotEmail) {
      this.forgotMessage = 'Please enter your email.';
      return;
    }

    // MOCK API call: replace with backend
    this.forgotMessage = `If ${this.forgotEmail} exists, a reset link has been sent.`;
    this.showForgot = false;
  }
}
