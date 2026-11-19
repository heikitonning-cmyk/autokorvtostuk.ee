# Dropbox photo archive

Uses the existing Supabase database and private job-photos bucket. The photo-archive Edge Function owns OAuth PKCE, encrypted Vault refresh credentials, and a narrow hourly cron credential. No secret is stored in Git or browser storage. Dropbox App Folder client ID is public by design.

Managers connect from Settings. OAuth requests expire after ten minutes, are bound to the manager and browser cookie, and consumed once. All user calls validate Supabase Auth and current active database role. Worker photo views additionally use the caller's existing RLS access.

Every hour, at minute 17 UTC, up to twenty photos of work dated more than thirty days ago are processed. Day-managed historical work or explicitly completed work is eligible. Cancelled/active jobs and recent completion dates are excluded. A manager may archive any selected job manually. The job ID and photo ID make paths deterministic. The destination is persisted before transfer, and the Dropbox content hash and byte length are checked before source deletion. Retry verifies the saved hash again. A five-minute database lease serializes archive and delete operations; functions stop a batch after 85 seconds.

Photo metadata remains attached to its job. Dropbox files remain private and are accessed via temporary links after authorization. Managers can delete a photo with confirmation. A disconnected/expired Dropbox connection never causes source deletion. Existing prices, invoices and payroll are untouched.

Deployment: apply migration, deploy supabase/functions/photo-archive with verify_jwt=false (the handler authenticates every call itself, using Auth or the dedicated cron credential), deploy work-app. OAuth redirect must equal https://app.autokorvtostuk.ee/api/dropbox/callback. The app needs account_info.read, files.metadata.read, files.content.read and files.content.write in App Folder scope. No sharing scopes.

Validation: node --experimental-strip-types --test work-app/tests/photo-archive.test.ts; repository CI; SQL privilege checks; manager OAuth/status, unauthorized request, and disposable photo upload/archive/view/delete smoke test after OAuth approval.
