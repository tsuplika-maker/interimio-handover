# Interimio Mobile (iOS & Android) – Capacitor Wrapper

Dieses Verzeichnis verpackt die Interimio Web-App (`/app/frontend`) als native App für den Apple App Store und Google Play.
Die App lädt das gebaute React-Frontend lokal und spricht mit dem Backend über `REACT_APP_BACKEND_URL`.

## Struktur
- `capacitor.config.json` – App-ID `com.interimio.app`, Name „Interimio“, webDir `../frontend/build`
- `ios/` – Xcode-Projekt (`ios/App/App.xcworkspace`)
- `android/` – Android-Studio-Projekt
- `assets/icon-only.png` (1024×1024) und `assets/splash.png` (2732×2732) – Quellbilder für Icons/Splash

## Voraussetzungen (lokaler Mac für iOS)
- Node 18+, Yarn
- Xcode 15+ inkl. Command Line Tools, CocoaPods (`sudo gem install cocoapods`)
- Android Studio (für Android), JDK 17
- Apple Developer Program (99 $/Jahr), Google Play Console (25 $ einmalig)

## Build-Ablauf
```bash
# 1) Frontend bauen (Produktions-URL in frontend/.env: REACT_APP_BACKEND_URL=https://<deine-domain>)
cd frontend && yarn install && yarn build

# 2) Native Projekte synchronisieren
cd ../mobile && yarn install && npx cap sync

# 3) Icons & Splash generieren (einmalig / bei Änderung)
npx @capacitor/assets generate --iconBackgroundColor '#06182b' --splashBackgroundColor '#06182b'

# 4) Öffnen & signieren
npx cap open ios       # Xcode: Team wählen, Bundle-ID com.interimio.app, Archive → App Store Connect
npx cap open android   # Android Studio: Build → Generate Signed Bundle (AAB) → Play Console
```

## Wichtig für Store-Freigabe
- **Backend-URL**: Vor dem Build die produktive Backend-URL in `frontend/.env` eintragen; die App kann nicht auf die Preview-URL zeigen.
- **CORS**: `CORS_ORIGINS` im Backend muss `capacitor://localhost` und `https://localhost` enthalten.
- **Datenschutzerklärung** (URL) und **Impressum** sind für beide Stores Pflicht; App-Store-Login-Vorgabe: Konto-Löschung muss möglich sein (Endpoint `DELETE /api/auth/me` bei Bedarf ergänzen).
- **Screenshots**: iPhone 6.7" und 6.5", iPad optional; Android Phone + 7"-Tablet.
- **Push-Benachrichtigungen** (neue Nachricht/Anfrage): `@capacitor/push-notifications` + Firebase Cloud Messaging – noch nicht integriert.

## PWA (ohne Store)
Die Website ist bereits installierbar (Manifest, Icons, Apple-Touch-Icon). Auf dem iPhone: Safari → Teilen → „Zum Home-Bildschirm“.
