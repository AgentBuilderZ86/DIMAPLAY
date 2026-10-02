# Maestro end-to-end flows

Run against a development build (EAS `development` profile, simulator) pointing at a Supabase
project with the local test OTP numbers from `supabase/config.toml` (`212600000001` -> `123456`).

```bash
maestro test e2e/auth_lifecycle.yaml
```

Not runnable in the Linux dev container (needs the iOS simulator on macOS); run on a Mac or in CI
with a macOS runner once the first development build exists.
