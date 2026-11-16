# School SMC Finder - runs entirely on Vercel (HTML + JavaScript, no Python, no GitHub Actions)

    public/index.html   the page (what your boss opens)
    api/crawl.js        finds the SMC page, members and PDFs on one school website
    api/cbse.js         reads each school's declared website from the official CBSE record
    api/pdf.js          fetches one PDF so the browser can save it
    api/_lib.js         shared code (address safety checks, optional access code)

## Deploy (free)
Option A - with GitHub: create a repository, upload everything in this folder (not node_modules), then on
vercel.com choose Add New > Project > import that repository > Framework Preset: **Other** > Deploy.

Option B - with the Vercel CLI: install Node.js, open a terminal in this folder and run
    npm install -g vercel
    vercel --prod

Your link is  https://<project-name>.vercel.app

## Optional but recommended: an access code
Project > Settings > Environment Variables > add  ACCESS_CODE  = a password. Redeploy.
Then the page asks for it, and strangers cannot use your project.

## How to use
1. Get the school list: open the page, "Step 1" > Show me how. Paste the code on the school-list page
   (F12 > Console). It clicks through all pages and downloads schools.csv.
2. Upload schools.csv in Step 2 and click Start. (Needs a School Name column; Affiliation No. lets it read
   the websites from CBSE's record.) Or choose "One website link".
3. When it finishes: Download Excel, and "Save all PDFs to a folder..." (Chrome/Edge: you pick the folder in
   File Explorer) or "Download all PDFs (zip)".

## Limits to know
- Vercel's free Hobby plan is for personal, non-commercial use only. For work use, check Vercel's terms/plans.
- One website check can take up to ~100 seconds. The page checks 4 websites at a time. A whole city takes a while:
  keep the tab open.
- PDFs larger than about 4 MB cannot be saved through the page (the link is still listed).
- Some school or CBSE sites may block Vercel's servers or be slow; those schools show an error or "unreachable".
- Please check the school-list website's Terms before collecting its list.
