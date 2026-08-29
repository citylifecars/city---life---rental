CITY LIFE CARS RENTAL MANAGEMENT SYSTEM - SUPABASE CLOUD BUILD v3

WHAT THIS BUILD CONNECTS
- Supabase email/password employee authentication
- Employee role/profile verification
- Vehicles cloud database
- Customers cloud database
- Rentals cloud database
- Payments cloud database
- Maintenance cloud database
- Rental agreements + private signature storage
- Customer driver-license / insurance private storage
- Vehicle inspection records + private photo storage
- Vercel build-time configuration from environment variables

BEFORE DEPLOYING
1. In Supabase SQL Editor, open supabase-upgrade.sql, copy all of it, and Run it once.
   Expected result: Success. No rows returned.
2. In Vercel Production Environment Variables confirm BOTH exist:
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
3. Never add your Supabase secret/service_role key to browser code or GitHub.

DEPLOY TO GITHUB / VERCEL
1. Extract this ZIP.
2. In the SAME GitHub repository Vercel already uses, replace the old website files with ALL files/folders from this package.
3. Commit the changes to main.
4. Vercel should automatically build and deploy.
5. Vercel will run npm run build and publish the dist folder automatically using vercel.json.
6. Open www.cityliferentalcars.com and sign in using the Supabase Owner email/password you created.

IMPORTANT
- The Publishable key is intended for browser use. Data access is enforced by the Row Level Security policies you already created.
- Secret/service_role keys must stay private and are NOT used by this build.
- Automatic SMS reminders are not connected yet; the Reminders screen is a preview/browser alert center.
- Hosted payment links work from Settings. Direct Stripe/Square API processing is a separate integration.
- Supabase automated backup capabilities depend on your Supabase plan/settings.

IF LOGIN SAYS CONFIGURATION IS MISSING
- Check Vercel > Project > Settings > Environment Variables.
- Make sure the two variables are in Production.
- Redeploy after changing environment variables because config.js is generated at build time.
