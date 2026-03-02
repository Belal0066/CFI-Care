import { Component } from '@angular/core';
import { LoginPageCards } from '../login-page-cards/login-page-cards';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth/auth.service';

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

  // error/success mssgs
  errorMessage = '';
  isLoading = false;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {
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
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter both email and password';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.email, this.password).subscribe({
      next: (response) => {
        console.log('Login successful:', response);
        this.handleRememberMe();
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        console.error('Login failed:', error);
        this.errorMessage = error.message || 'Login failed. Please check your credentials.';
        this.isLoading = false;
      }
    });
  }

  /** SIGNUP */
  signup() {
    
    if (!this.email || !this.password || !this.fullName) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    if (this.password.length < 8) {
      this.errorMessage = 'Password must be at least 8 characters';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.register(this.email, this.password, this.fullName).subscribe({
      next: (response) => {
        console.log('Registration successful:', response);
        this.handleRememberMe();
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        console.error('Registration failed:', error);
        this.errorMessage = error.message || 'Registration failed. Please try again.';
        this.isLoading = false;
      }
    });
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
