# Test User Credentials

## Login Information

**Email**: `test@example.com`
**Password**: `TestPassword123`

## Notes
- The password was changed from `TestPassword123!` to `TestPassword123` (removed the exclamation mark) due to JSON escaping issues
- User has been created via Supabase Admin API
- Email is pre-confirmed so you can login immediately

## If login still fails:
1. Check that Supabase is running: `npx supabase status`
2. Make sure the app is using the correct URL: `http://127.0.0.1:54321`
3. Try clearing browser cache/cookies
4. Check browser console for specific error messages