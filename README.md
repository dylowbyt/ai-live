# WhatsApp AI Realtime — QR / Baileys

Versi ini menggunakan WhatsApp Web session melalui Baileys, sehingga login pertama dilakukan dengan QR.

## Alur

Railway → `/qr` → tampil QR → WhatsApp > Linked Devices > Link a device → scan.

Setelah berhasil:
Text / Voice / Image / Sticker → GPT-Realtime-2.1 → voice note.

## Railway

Environment:
```text
OPENAI_API_KEY=...
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
BOT_NAME=Raka
MAX_HISTORY=12
AUTH_DIR=./auth
```

Railway memakai Dockerfile dan memasang FFmpeg.

## Penting: persistent storage

Session WhatsApp disimpan di folder `AUTH_DIR`. Di Railway, gunakan **persistent volume** yang dipasang ke `/app/auth` agar session tidak hilang saat redeploy/restart.

Jika session hilang, bot akan meminta QR scan lagi.

## QR

Setelah deploy, buka:
```text
https://DOMAIN-RAILWAY-KAMU/qr
```

Scan QR dari:
WhatsApp → Linked Devices → Link a device.

## Catatan

Baileys mengotomasi WhatsApp Web; ini berbeda dari WhatsApp Cloud API resmi Meta. Gunakan dengan memahami kebijakan WhatsApp dan hanya untuk penggunaan yang kamu berwenang lakukan.

MVP ini sengaja sederhana:
- memory percakapan masih in-memory
- belum ada persistent database
- belum ada rate limit/queue
- belum ada admin allowlist
- belum ada deduplication lintas restart

Tambahkan itu sebelum dipakai serius/untuk banyak pengguna.
