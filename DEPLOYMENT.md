# Deployment

## Backend on Railway

Deploy the repository root as the Railway service root. Railway detects the
Python dependencies from `requirements.txt` and starts the service with the
command in `railway.toml`. That command applies migrations, collects Django
static files, and starts Gunicorn.

Set these variables on the Railway web service:

- `DJANGO_SECRET_KEY`: a newly generated, private Django secret key.
- `DJANGO_ALLOWED_HOSTS`: the Railway public hostname, without `https://`.
- `CORS_ALLOWED_ORIGINS`: the frontend origin, such as
  `https://matrimony-sepia-phi.vercel.app`.
- `CSRF_TRUSTED_ORIGINS`: the frontend and backend origins, comma separated,
  including `https://`.
- `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`: use
  the values exposed by the Railway MySQL service. Railway variable references
  can connect these to the web service.

Keep `DEBUG` unset or set it to `False` in production. The Railway proxy's
forwarded HTTPS header and secure session/CSRF cookies are configured in Django.

## Frontend

This repository contains no frontend source or package/build manifest, so it
cannot produce a frontend deployment. The existing frontend origin is
configurable through `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Deploy
the frontend from its own source repository and set its API base URL to this
backend's public URL.
