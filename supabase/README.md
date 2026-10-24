# Supabase production setup

The included migration creates the archive tables, indexes, RLS policies and a private
`archive-media` storage bucket. It has not been applied because no Supabase project
credentials were supplied.

1. Create a project at <https://supabase.com/dashboard>.
2. Open **SQL Editor**, create a new query, paste
   `migrations/202610230001_initial_schema.sql`, and run it once.
3. Open **Project Settings → API**, copy the Project URL and anon public key.
4. Open **Project Settings → API**, copy the service-role key only into a local
   `.env.local` file. Never prefix it with `NEXT_PUBLIC_` or commit it.
5. Open **Storage**, confirm that `archive-media` exists and remains private.
6. Set a strong `SUPABASE_SERVICE_ROLE_KEY` server environment variable in the hosting
   provider. The local development adapter does not require it.

For serverless deployments, replace the local SQLite repository with the Supabase data
access layer and use short-lived signed URLs for private media. The schema and RLS rules
are ready; the API adapter itself still needs to be switched and integration-tested
against the live project.
