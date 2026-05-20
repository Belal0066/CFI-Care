export interface OtpResponse {
  message: string;
  otp: string;
  expiresIn: string;
}

export interface VerifyOtpResponse {
  message: string;
  handshakeId: string;
  targetpatientId: string;
  expiresIn: string;
}

export interface Grant {
  grantId: string;
  patientId: string;
  practitionerId: string;
  status: 'active';
  scopes: string[];
  createdAt: string;
  expiresAt: string;
}

export interface PendingGrant {
  handshakeId: string;
  patientId: string;
  practitionerId: string;
  createdAt: string;
}

export interface HandshakeStatus {
  status: 'pending' | 'approved' | 'expired';
  handshakeId?: string;
  grant?: Grant;
}
