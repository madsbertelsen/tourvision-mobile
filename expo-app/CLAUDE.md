# Claude Development Notes

## Important Commands

### Starting the Development Server
**Always use:** `npx expo start --web`
- Do NOT use `npm run web` or similar commands
- The direct `npx expo start` command is more reliable

### Common Options
- `npx expo start --web --clear` - Start with cleared cache
- `npx expo start --web --port 8081` - Start on specific port

## Project Structure
- Frontend code is in `/expo-app` directory
- Database migrations are in `/supabase/migrations`
- Components use NativeWind for Tailwind CSS styling

## NativeWind Configuration
- Tailwind CSS is configured via NativeWind
- Global styles are in `global.css`
- Config file: `tailwind.config.js`
- Metro is configured with NativeWind in `metro.config.js`

## Database
- Using Supabase for backend
- Run `npx supabase start` for local development
- Migrations are in `/supabase/migrations`

## Testing & Linting
- Run linting: `npm run lint` (if available)
- Run type checking: `npm run typecheck` (if available)

## Known Issues
- Babel configuration can be sensitive - if errors occur with `.plugins is not a valid Plugin property`, check babel.config.js
- When switching between different start commands, always clear the cache with `--clear` flag