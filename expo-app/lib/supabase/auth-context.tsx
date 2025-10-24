import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { Session, User } from '@supabase/supabase-js'
import * as AppleAuthentication from 'expo-apple-authentication'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from './client'

type AuthContextType = {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  updatePassword: async () => {},
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
})

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Configure Google Sign-In
    if (Platform.OS !== 'web') {
      GoogleSignin.configure({
        iosClientId: '413818437166-0olqavgvmima7avkks72ab5d122or8fc.apps.googleusercontent.com', // Replace with your iOS Client ID
        // androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com', // Not needed - auto-detected from google-services.json
      })
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'tourvision://reset-password',
    })
    if (error) throw error
  }

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
  }

  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      // Web: Use OAuth flow
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
    } else {
      // iOS/Android: Use native Google Sign-In
      try {
        await GoogleSignin.hasPlayServices()
        const userInfo = await GoogleSignin.signIn()

        if (!userInfo.data?.idToken) {
          throw new Error('No ID token present!')
        }

        console.log('Google Sign In succeeded:', {
          email: userInfo.data.user.email,
          name: userInfo.data.user.name,
        })

        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        })

        if (error) {
          // If Google provider is not enabled in Supabase, show helpful error
          if (error.message.includes('Provider') && error.message.includes('not enabled')) {
            throw new Error(
              'Google Sign In succeeded, but Supabase Google provider is not configured. ' +
              'Please enable Google provider in Supabase Dashboard → Authentication → Providers.'
            )
          }
          throw error
        }
      } catch (e: any) {
        if (e.code === 'SIGN_IN_CANCELLED') {
          throw new Error('Sign in canceled')
        }
        throw e
      }
    }
  }

  const signInWithApple = async () => {
    if (Platform.OS === 'web') {
      // Web: Use OAuth flow
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
    } else {
      // iOS/Android: Use native Apple Authentication
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        })

        console.log('Apple Sign In succeeded:', {
          user: credential.user,
          email: credential.email,
          fullName: credential.fullName,
        })

        // Try to sign in with Supabase using the Apple credential
        // Note: For local development with skip_nonce_check=true, we don't pass a nonce
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken!,
        })

        if (error) {
          // If Apple provider is not enabled in Supabase, show helpful error
          if (error.message.includes('Provider') && error.message.includes('not enabled')) {
            throw new Error(
              'Apple Sign In succeeded, but Supabase Apple provider is not configured. ' +
              'Please enable Apple provider in Supabase Dashboard → Authentication → Providers.'
            )
          }
          throw error
        }
      } catch (e: any) {
        if (e.code === 'ERR_REQUEST_CANCELED') {
          // User canceled the sign-in flow
          throw new Error('Sign in canceled')
        }
        throw e
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!session,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        signInWithGoogle,
        signInWithApple,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}