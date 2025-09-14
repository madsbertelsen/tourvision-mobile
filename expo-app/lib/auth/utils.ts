import { Alert } from 'react-native';

// Email validation
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation
export const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Format auth error messages for user display
export const formatAuthError = (error: any): string => {
  if (!error) return 'An unknown error occurred';
  
  const errorMessage = error.message || error.toString();
  
  // Map Supabase error messages to user-friendly messages
  const errorMap: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Please verify your email before logging in',
    'User already registered': 'An account with this email already exists',
    'Password is too weak': 'Please choose a stronger password',
    'Network request failed': 'Please check your internet connection',
    'User not found': 'No account found with this email',
    'Invalid email': 'Please enter a valid email address',
    'Email rate limit exceeded': 'Too many attempts. Please try again later',
  };
  
  // Check if error message contains any of our mapped messages
  for (const [key, value] of Object.entries(errorMap)) {
    if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return errorMessage;
};

// Show auth error alert
export const showAuthError = (error: any, title: string = 'Error') => {
  const message = formatAuthError(error);
  Alert.alert(title, message);
};

// Password strength indicator
export type PasswordStrength = 'weak' | 'medium' | 'strong';

export const getPasswordStrength = (password: string): PasswordStrength => {
  if (password.length < 8) return 'weak';
  
  let strength = 0;
  
  if (password.length >= 12) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  
  if (strength <= 2) return 'weak';
  if (strength <= 3) return 'medium';
  return 'strong';
};

// Secure storage keys
export const AUTH_STORAGE_KEYS = {
  SESSION: 'supabase.auth.token',
  REMEMBER_ME: 'auth.remember_me',
  LAST_EMAIL: 'auth.last_email',
} as const;

// Session timeout (24 hours)
export const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;

// Check if session is expired
export const isSessionExpired = (expiresAt: string | number): boolean => {
  const expiryTime = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  return Date.now() > expiryTime;
};

// Generate a secure random string for state parameters
export const generateRandomString = (length: number = 16): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Validate name
export const validateName = (name: string): boolean => {
  return name.trim().length >= 2;
};

// Format user display name
export const formatUserDisplayName = (user: any): string => {
  if (!user) return 'Guest';
  
  if (user.user_metadata?.full_name) {
    return user.user_metadata.full_name;
  }
  
  if (user.email) {
    return user.email.split('@')[0];
  }
  
  return 'User';
};

// Get user initials for avatar
export const getUserInitials = (user: any): string => {
  const displayName = formatUserDisplayName(user);
  
  if (!displayName || displayName === 'Guest') return '?';
  
  const parts = displayName.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  
  return displayName.substring(0, 2).toUpperCase();
};