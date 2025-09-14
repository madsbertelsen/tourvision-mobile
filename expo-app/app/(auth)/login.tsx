import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/supabase/auth-context';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#6366F1', '#8B5CF6']}
        className="absolute top-0 left-0 right-0 h-[300px] rounded-b-[30px]"
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, paddingTop: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10">
          <View className="w-20 h-20 bg-white rounded-[20px] justify-center items-center shadow-lg">
            <Text className="text-[40px] font-bold text-indigo-500">T</Text>
          </View>
          <Text className="text-[32px] font-bold text-white mt-4">TourVision</Text>
          <Text className="text-base text-white/90 mt-2">Plan your perfect journey</Text>
        </View>

        <View className="flex-1 bg-white rounded-t-[30px] px-6 pt-8 shadow-lg">
          <Text className="text-[28px] font-bold text-gray-800 mb-2">Welcome Back</Text>
          <Text className="text-base text-gray-500 mb-8">Sign in to continue your adventure</Text>

          <View className="flex-row items-center bg-gray-50 rounded-xl px-4 mb-4 border border-gray-200">
            <Feather name="mail" size={20} color="#666" />
            <TextInput
              className="flex-1 h-[52px] text-base text-gray-800 ml-3"
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <View className="flex-row items-center bg-gray-50 rounded-xl px-4 mb-4 border border-gray-200">
            <Feather name="lock" size={20} color="#666" />
            <TextInput
              className="flex-1 h-[52px] text-base text-gray-800 ml-3"
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              className="p-1"
            >
              <Feather 
                name={showPassword ? 'eye-off' : 'eye'} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>

          <Link href="/forgot-password" asChild>
            <TouchableOpacity className="self-end mb-6">
              <Text className="text-indigo-500 font-medium">Forgot Password?</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            className={`bg-indigo-500 rounded-xl py-4 items-center mb-6 ${isLoading ? 'opacity-70' : ''}`}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-lg font-semibold">Sign In</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row items-center mb-6">
            <View className="flex-1 h-[1px] bg-gray-200" />
            <Text className="mx-4 text-gray-500">OR</Text>
            <View className="flex-1 h-[1px] bg-gray-200" />
          </View>

          <TouchableOpacity className="flex-row items-center justify-center bg-white border border-gray-200 rounded-xl py-4 mb-8">
            <View className="w-5 h-5 bg-gray-300 rounded mr-3" />
            <Text className="text-gray-700 text-base font-medium">Continue with Google</Text>
          </TouchableOpacity>

          <View className="flex-row justify-center">
            <Text className="text-gray-600">Don't have an account? </Text>
            <Link href="/register" asChild>
              <TouchableOpacity>
                <Text className="text-indigo-500 font-semibold">Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}