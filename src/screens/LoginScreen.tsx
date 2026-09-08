import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { ApiError } from '../services/api';
import { Screen } from '../components/Screen';

const logo = require('../../assets/uvactive-logo.jpg');

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      // On success, staff state updates and RootNavigator swaps to Main automatically.
      // The session (access + refresh token) is persisted to SecureStore by
      // login()/tokenStore, so the next app open goes straight to Home —
      // no repeat login required.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>UV Active</Text>
          <Text style={styles.subtitle}>Trainer</Text>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@gym.com"
          placeholderTextColor={colors.mutedForeground}
          editable={!loading}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            editable={!loading}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
            {showPassword ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={submit}
          disabled={loading || !email || !password}
        >
          {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.submitText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { width: 88, height: 88, borderRadius: radius.lg, marginBottom: spacing.md },
  title: { fontFamily: fonts.heading, fontSize: 32, color: colors.foreground },
  subtitle: { fontFamily: fonts.body, fontSize: 16, color: colors.primary, marginTop: spacing.xs },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.mutedForeground, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.foreground,
  },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: spacing.md },
  otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8 },
  error: { color: colors.destructive, fontFamily: fonts.body, fontSize: 13, marginTop: spacing.md },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.primaryForeground },
  linkText: { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.lg, fontFamily: fonts.body },
});
