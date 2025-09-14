import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen 
        name="login" 
        options={{
          title: 'Login',
        }}
      />
      <Stack.Screen 
        name="register" 
        options={{
          title: 'Register',
        }}
      />
      <Stack.Screen 
        name="forgot-password" 
        options={{
          title: 'Forgot Password',
        }}
      />
    </Stack>
  );
}