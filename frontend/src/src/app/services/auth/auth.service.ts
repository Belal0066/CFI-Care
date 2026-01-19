import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface AuthResponse {
  success: boolean;
  user: {
    sub: string;
    email: string;
    name: string;
  };
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user?: {
    sub: string;
    email: string;
    name: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = `${environment.apiUrl}/auth`;
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // check authN status on service init
    this.checkAuthStatus();
  }

  //  login
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, { 
      email, 
      password 
    }, {
      withCredentials: true // include cookies in requests
    }).pipe(
      tap(response => {
        if (response.success) {
          this.currentUserSubject.next(response.user);
        }
      }),
      catchError(this.handleError)
    );
  }

//  register
  register(email: string, password: string, fullName: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/register`, {
      email,
      password,
      fullName
    }, {
      withCredentials: true // include cookies in requests
    }).pipe(
      tap(response => {
        if (response.success) {
          this.currentUserSubject.next(response.user);
        }
      }),
      catchError(this.handleError)
    );
  }

  // check authN stat
  checkAuthStatus(): Observable<AuthStatusResponse> {
    return this.http.get<AuthStatusResponse>(`${this.API_URL}/me`, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.authenticated && response.user) {
          this.currentUserSubject.next(response.user);
        } else {
          this.currentUserSubject.next(null);
        }
      }),
      catchError(error => {
        this.currentUserSubject.next(null);
        return throwError(() => error);
      })
    );
  }


  getCurrentUser() {
    return this.currentUserSubject.value;
  }

 
  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

 
  logout() {
    this.currentUserSubject.next(null);
    return this.http.post(`${this.API_URL}/logout`, {}, {
      withCredentials: true
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Handle HTTP errors
  
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = error.error?.error || error.message || 'Server error';
    }
    
    console.error('Auth error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
