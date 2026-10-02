# PIBG SKKJS PWA V4 — Security Hardened

Versi ini mengekalkan reka bentuk V4 dan menambah beberapa kawalan keselamatan penting:

- Tiada lagi default password dalam fail frontend/repository.
- Login menggunakan **one-time challenge response**; password sebenar tidak dihantar dalam URL.
- Token sesi tamat selepas 30 minit.
- Maksimum 5 percubaan login gagal dalam 15 minit bagi setiap username.
- Challenge login hanya boleh digunakan sekali dan tamat selepas 3 minit.
- Password disimpan sebagai SHA-256 hash dalam Google Sheet.
- Admin API tetap memerlukan token + role Admin.
- Pautan dokumen baharu mesti HTTPS.
- ID dokumen menggunakan UUID.
- `Code.gs` sengaja menggunakan placeholder `SHEET_ID`; masukkan Sheet ID hanya dalam projek Apps Script PRIVATE.

## Penting sebelum GitHub

1. Jangan upload folder `google-apps-script` ke repository GitHub public jika anda mahu merahsiakannya. Folder itu adalah untuk projek Apps Script PRIVATE.
2. Untuk GitHub Pages, upload hanya frontend:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `sw.js`
   - `manifest.webmanifest`
   - folder `assets/`
3. Backend Apps Script kekal private dan hanya URL `/exec` digunakan oleh frontend.
4. Jika akaun `admin` atau `pibg` masih menggunakan password lama, tukar passwordnya. Jangan letak password sebenar dalam GitHub.

## Tambah user baharu

Frontend meminta `passwordHash`, bukan password biasa. Fungsi admin di frontend telah disesuaikan untuk menghasilkan hash di browser sebelum dihantar.

## Reset password

Gunakan fungsi `setUserPassword_(username, newPassword)` hanya dari Apps Script editor yang private. Selepas reset, padamkan/ubah fungsi tersebut jika projek akan dikongsi kepada orang lain.
