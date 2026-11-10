# Deployment

## Railway backend

Deploy the repository root as the Railway service root. Railpack uses Node.js 24
and Python 3.12 to build the Vite frontend, verify that every JS/CSS URL in
`dist/index.html` exists under `dist/assets/`, and collect Django static files.
Railway starts the service only after that build succeeds; the start command
applies migrations and starts Gunicorn. Set:

- `DJANGO_SECRET_KEY`: private production Django key.
- `DJANGO_ALLOWED_HOSTS`: comma separated backend hosts.
- `CORS_ALLOWED_ORIGINS`: comma separated frontend origins.
- `CSRF_TRUSTED_ORIGINS`: comma separated origins including `https://`.
- `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`:
  Railway MySQL connection values.
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
  `DEFAULT_FROM_EMAIL`: SMTP settings from your email provider. Use port `587`
  with `EMAIL_USE_TLS=true` and `EMAIL_USE_SSL=false`, or port `465` with
  `EMAIL_USE_SSL=true` and `EMAIL_USE_TLS=false`. The application rejects
  enabling TLS and SSL together. `EMAIL_TIMEOUT` sets the SMTP connection
  timeout in seconds (default `10`). Keep credentials only in Railway variables.
- `ADMIN_NOTIFICATION_EMAIL`: destination for profile review notices.
- `ADMIN_DASHBOARD_URL`: frontend origin used for admin review links.
- `FRONTEND_URL`: frontend origin used in client emails and password-reset
  links. Password-reset links expire after 30 minutes. No additional
  password-reset environment variables are required.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: Razorpay API credentials for
  creating membership orders and confirming captured payments. Keep the secret
  only in Railway variables.
- `RAZORPAY_WEBHOOK_SECRET`: secret configured for the Razorpay webhook below.
- `OTP_EXPIRY_SECONDS` (default `300`), `OTP_RESEND_COOLDOWN_SECONDS`
  (default `60`), and `OTP_MAX_ATTEMPTS` (default `5`): positive integer OTP
  policy values.
- `MOBILE_OTP_MODE=console` enables backend-only mobile OTP generation for a
  non-production test service. Codes are written to Django/Railway application
  logs; this mode does not send SMS. Leave it unset or use `disabled` in
  production. No SMS provider is integrated in this project.

Keep `DEBUG` false in production. This repository is deployed from its root:
Railway builds and starts `manage.py` and `config.wsgi` from that service root.
For the current Railpack deployment, attach a Railway Volume to the backend
service with mount path `/app/media` (the media directory under the app root).
Railway sets `RAILWAY_VOLUME_MOUNT_PATH` to the mount path actually configured
for the service; Django uses that value as `MEDIA_ROOT`, ahead of any manually
configured `MEDIA_ROOT` fallback.
If the volume mount variable is absent, the WSGI app logs a critical warning
and starts with `/app/media` as its temporary media root. Media writes are
rejected until Railway provides the mount path, so uploads are not silently
saved to ephemeral container storage.

In Railway, open the backend service's **Volumes** settings, add a volume, set
its mount path to `/app/media`, and deploy. Confirm the deployment has
`RAILWAY_VOLUME_MOUNT_PATH=/app/media` and that the volume is attached to the
backend service (not the frontend). If the service root or container layout is
customized, use the actual desired persistent directory as the Volume mount
path instead of `/app/media`; Django will use the path Railway provides without
requiring a code change. Do not separately set `MEDIA_ROOT` to a different
directory.

Without a mounted volume, uploaded files can disappear on redeploy. Existing
database FileField names are not changed when media storage is configured.
Files that have already disappeared from ephemeral storage cannot be recovered
from the database and must be uploaded again; any files still available in the
old service should be copied to the volume while that service is accessible.
Public profile images are served under `/media/profiles/`; pending uploads use
authenticated API URLs. The client Edit Profile page reports a missing saved
profile photo and provides the existing upload field for replacing it. Approval
continues to fail until all referenced pending files are present.

The deployment command runs database migrations before startup. Confirm that
`adminpanel.0002_profilechange` and `registrations.0009_unique_registration_phone`
succeed in Railway deployment logs. Before applying the latter to an existing
database, review its duplicate-phone preflight: it stops if normalized duplicate
phone values exist, then converts blank phone values to `NULL` before adding
the unique constraint. Back up the Railway database and review
`python manage.py migrate --plan` before deployment.
The `registrations` app retains `AutoField` IDs to match its migration history;
do not generate a primary-key widening migration unless a deliberate database
migration plan has been reviewed for the existing MySQL tables and foreign keys.

## Frontend

This repository contains the React/Vite app. Set `VITE_API_URL` to the Railway
backend origin without `/api` before building. `src/api.js` appends `/api`.
Build and verify the frontend locally from the repository root:

```powershell
npm ci
npm run build
npm run verify:build
```

The build command also runs the asset verification. In Django, existing
`/assets/...` files are served with their file MIME type; missing asset paths
return a plain-text 404 and are excluded from the React Router fallback.
Redeploy the Railway service after code changes.

### Gold membership contact credits

The Gold plan checkout uses Razorpay. Configure a Razorpay webhook to send the
`payment.captured` event to
`https://<backend-host>/api/memberships/razorpay/webhook/`, and set the matching
webhook secret as `RAZORPAY_WEBHOOK_SECRET`. The backend grants 20 contact
credits only after confirming the payment signature, captured status, amount
(₹1,499), and INR currency. A confirmed order can grant credits only once.

Credits are stored against the member account, decrease once per distinct
profile whose contact details are unlocked, and are not consumed again when a
member revisits that profile. They remain in the account until used; logging out
does not reset them. The frontend loads Razorpay Checkout from Razorpay's
official checkout script.

## Verification

1. Deploy the backend and confirm migrations and Gunicorn start successfully.
2. Upload profile and gallery images. Refresh the client pages and verify the
   images load from the persistent media volume.
3. Edit a published profile. Confirm the public data remains unchanged and the
   admin dashboard lists the update under review.
4. Approve the update. Confirm the changed profile and images are public and
   the client receives the updated-profile email.
5. Register a new profile, approve it, and publish it. Confirm the initial
   approval email is sent after publication.
6. Try correction and rejection. Confirm the client receives the admin's
   message and rejected changes are not published.
7. Confirm a client cannot open another client's pending file or call admin
   approval endpoints.

SMTP delivery requires valid provider credentials and a verified sender.
Email/SMS OTP delivery failures stop verification and return a delivery error;
registration cannot complete until both channels are verified. Post-registration
and profile-change notifications are sent after the database transaction
commits. Configure SMTP and `ADMIN_NOTIFICATION_EMAIL` so these notifications
reach their recipients; delivery failures are logged without undoing a saved
registration or profile update.

Mobile verification's console mode does not send SMS. For local testing in
PowerShell, enable console mode and start Django:

```powershell
$env:MOBILE_OTP_MODE = "console"
python manage.py runserver
```

The generated mobile OTP is logged to the Django development console, while
only its hash is stored and the API never returns the code. OTPs expire after
five minutes by default. A Railway test service can use `DEBUG=false` with
`MOBILE_OTP_MODE=console` to write codes to Railway deployment logs. Enable this
only on a non-production service; leave the mode `disabled` in production.

Email settings are read from the Railway environment variables above. For
Gmail, use `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_USE_TLS=true`,
and `EMAIL_USE_SSL=false`; set `EMAIL_HOST_USER` to the full Gmail address and
`EMAIL_HOST_PASSWORD` to a Google App Password (not the normal account
password). `DEFAULT_FROM_EMAIL` should be that same verified address. Check the
backend application logs for a credential-redacted SMTP exception name, status
code, and server response when delivery fails. The application does not log
SMTP credentials or return them in API errors.

The registration flow first requests email and mobile codes, verifies each
code, then passes the one-time verification token through the existing
registration steps. OTP hashes are stored in the database; the codes are never
included in API responses. Deploy the `registrations.0011_verificationchallenge`
migration together with the backend code, then rebuild/redeploy the frontend.
The resend endpoint is `/api/registrations/verification/resend/`; it enforces
the configured per-channel cooldown even when a provider delivery fails, and
only replaces the stored OTP after its delivery path completes successfully.
Before production, test email OTP delivery with the Railway SMTP variables
configured. Mobile verification stays disabled until an SMS provider is
deliberately integrated.
