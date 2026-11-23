/*
# Revoke EXECUTE on handle_new_user trigger function

## Overview
The `handle_new_user()` SECURITY DEFINER function is a database trigger that
auto-creates a profile row when a new auth user signs up. It should only be
invoked by the `on_auth_user_created` trigger on `auth.users`, never called
directly via the REST API. The security advisor flagged that anon and
authenticated roles could execute it via `/rest/v1/rpc/handle_new_user`.

## Security Changes
- REVOKE EXECUTE on `public.handle_new_user` from `anon` and `authenticated`.
- The trigger still works because trigger functions execute with the
  privileges of the table owner (the postgres superuser), not the calling role.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
