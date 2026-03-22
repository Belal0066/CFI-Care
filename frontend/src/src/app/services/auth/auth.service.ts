import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject , of} from 'rxjs';
import { catchError, tap, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// for logout to call both backend and oauth
import { switchMap } from 'rxjs/operators';


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

export interface LogoutResponse {
  ok: boolean;
  logoutUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = environment.authUrl;
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private sessionInitOnce$?: Observable<void>;


  constructor(private http: HttpClient) {}

  // private initSessionAndAuthState(): void {
  //   this.http.get<{ success: boolean; user?: any }>(`${this.API_URL}/session-init`, {
  //     withCredentials: true
  //   }).subscribe({
  //     next: () => this.checkAuthStatus().subscribe(),
  //     error: () => this.checkAuthStatus().subscribe()
  //   });
  // }

  loginWithOAuth(returnTo: string = '/dashboard'): void {
    window.location.assign(`/oauth2/start?rd=${encodeURIComponent(returnTo)}`);
  }



  // check authN stat
  checkAuthStatus(): Observable<AuthStatusResponse> {
  return this.http.get<AuthStatusResponse>(`${this.API_URL}/me`, {
    withCredentials: true,
  }).pipe(
    tap((response) => {
      this.currentUserSubject.next(response.authenticated ? response.user ?? null : null);
      if (!response.authenticated) {
        this.sessionInitOnce$ = undefined;
      }
    }),
    catchError((error) => {
      this.currentUserSubject.next(null);
      this.sessionInitOnce$ = undefined;
      return throwError(() => error);
    })
  );
}


  initSessionOnce(): Observable<void> {
    if (!this.sessionInitOnce$) {
      this.sessionInitOnce$ = this.http.get<{ success: boolean }>(`${this.API_URL}/session-init`, { withCredentials: true }).pipe(
          map(() => void 0),
          catchError(() => of(void 0)),
          shareReplay(1)
        );
    }
    return this.sessionInitOnce$;
  }

  ensureSessionInitializedIfAuth(): Observable<boolean> {
    return this.checkAuthStatus().pipe(
      switchMap((res) => {
        if (!res.authenticated) return of(false);
        return this.initSessionOnce().pipe(map(() => true));
      })
    );
  }



  getCurrentUser() {
    return this.currentUserSubject.value;
  }


  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  logout(): void {
    this.currentUserSubject.next(null);
    this.sessionInitOnce$ = undefined;
    window.location.assign('/auth/logout');
  }


  // Logout from ALL devices/sessions
  logoutAll(): Observable<any> {
    this.currentUserSubject.next(null);
    return this.http.post<{ ok: boolean; message?: string }>(
      `${this.API_URL}/logout-all`,
      {},
      { withCredentials: true }
    ).pipe(
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
      // details -_-
      const details = (error.error && Array.isArray(error.error.details))
        ? error.error.details.map((d: any) => d.message).join('; ')
        : null;

      errorMessage = details || error.error?.error || error.message || 'Server error';
    }

    console.error('Auth error:', errorMessage, error.error?.details || '');
    return throwError(() => new Error(errorMessage));
  }
}
