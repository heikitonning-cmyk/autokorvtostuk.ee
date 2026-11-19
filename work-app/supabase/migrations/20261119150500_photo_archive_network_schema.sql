-- pg_net was introduced by the preceding migration and has not processed any jobs yet.
drop extension pg_net;
create extension pg_net with schema extensions;
revoke all on schema net from public, anon, authenticated;
