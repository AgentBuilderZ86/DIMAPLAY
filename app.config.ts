import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Dima Play',
  slug: 'dima-play',
  scheme: 'dimaplay',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    usesAppleSignIn: true,
    // Placeholder: confirm with the Apple Developer account before the first EAS build.
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'ma.dimaplay.app',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: 'Dima Play utilise la caméra pour filmer tes matchs.',
      NSMicrophoneUsageDescription:
        'Dima Play utilise le micro pour enregistrer le son de tes matchs.',
      NSPhotoLibraryUsageDescription:
        'Dima Play accède à ta photothèque pour importer la vidéo d’un match.',
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? 'ma.dimaplay.app',
    adaptiveIcon: {
      backgroundColor: '#0F4D32',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-localization',
    'expo-splash-screen',
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-notifications',
    [
      'expo-image-picker',
      { photosPermission: 'Dima Play accède à ta photothèque pour importer la vidéo d’un match.' },
    ],
    'expo-video',
  ],
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL,
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  },
};

export default config;
