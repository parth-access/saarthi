-- Defence in depth on top of 0001's RLS: Supabase's Data API roles get no
-- privileges at all on the auth tables. Only the app's own connection
-- (the table owner, via DATABASE_URL) reads or writes them.

revoke all on table "user", "session", "account", "verification", "rateLimit" from anon, authenticated;
