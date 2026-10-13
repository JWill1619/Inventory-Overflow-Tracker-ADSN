-- Only the credential fields required for authenticated password rotation.
grant update(password_hash, rotated_at) on adsn.credential to adsn_app;
