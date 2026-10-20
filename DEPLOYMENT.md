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
  enabling TLS and SSL together. Keep credentials only in Railway variables.
- `ADMIN_NOTIFICATION_EMAIL`: destination for profile review notices.
- `ADMIN_DASHBOARD_URL`: frontend origin used for admin review links.
- `FRONTEND_URL`: frontend origin used in client emails.

Keep `DEBUG` false in production. Attach a Railway Volume to the backend at
`/app/media`; Django uses `RAILWAY_VOLUME_MOUNT_PATH` for `MEDIA_ROOT`. Without
a mounted volume, uploaded files can disappear on redeploy. Existing ephemeral
uploads need to be copied to the volume or uploaded again. Public profile images
are served under `/media/profiles/`; pending uploads use authenticated API URLs.

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
Without those settings, production email errors are logged; the API action
still succeeds after its database transaction commits.
