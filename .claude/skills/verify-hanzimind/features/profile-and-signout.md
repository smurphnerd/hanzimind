# Profile and sign out

A signed-in learner sees a dashboard at `/`, reaches `/profile` from the header avatar or the `Profile` nav link, sees their name and email there, and signs out with the `Sign out` button, which returns them to the signed-out landing page. The header carries the nav, the theme toggle, and the avatar. The footer links to two static pages, `/resources` and `/privacy`.

## Sub-features

- `dashboard` shows the signed-in home at `/` with the greeting, the resume card, and three stat tiles.
- `header-signed-in` shows the nav links, the theme toggle, and the `Your profile` avatar link.
- `header-admin-menu` shows the `Admin` dropdown with `Vocabulary` and `Suggestions` for an admin only.
- `theme-toggle` switches between light and dark from the header.
- `profile-page` shows the account name and email on `/profile`.
- `profile-signed-out` shows a `Sign in` link on `/profile` when there is no session.
- `sign-out` ends the session from `/profile` and returns to the landing page.
- `footer-links` shows `Resources` and `Privacy Policy` in the footer on every page.
- `privacy-page` renders `/privacy` with the title `Privacy`.
- `resources-page` renders `/resources` with the title `Resources`.

## How to get to it (user POV)

- Open `http://localhost:PORT/` while signed in. It shows the dashboard instead of the landing page.
- Click the round avatar at the right of the header, or the `Profile` nav link, or open `http://localhost:PORT/profile`.
- Choose `Sign out` on `/profile`. There is no sign-out control anywhere else.
- Click `Resources` or `Privacy Policy` in the footer, or open `http://localhost:PORT/resources` and `http://localhost:PORT/privacy`.
- Click the moon or sun button at the right of the header to change theme.
- Sign in as `verify-admin@hanzimind.test` to see the `Admin` dropdown next to `Profile` in the header.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up and `scripts/doctor.sh <n>` printed four `ok` lines. `PORT` is the lane's dev port.
- The lane was seeded with `SEED_TEST_USER=1`, so `verify@hanzimind.test` has the display name `Verify Learner` and `verify-admin@hanzimind.test` has `Verify Admin`.
- The tab is signed in as `verify@hanzimind.test` / `verify-hanzimind` by the `signin-success` bullet in `sign-in.md`. The `header-admin-menu` bullet needs a second sign-in as `verify-admin@hanzimind.test` with the same password.
- The tab is at least 640px wide so the header nav is rendered.

- **Dashboard.** Open the home page signed in. Run `navigate url="http://localhost:PORT/"` then `get_page_text`. The heading reads `Welcome back!` with `Your garden's looking healthy. Let's keep it growing.` under it and a `5 day streak` pill to the right. A resume card shows `20`, `Reviews ready today`, and `Continue · HSK 1 Standard Course`. Three tiles read `150` `Items learned`, `5` `Day streak`, and `20` `Reviews due`. Run `read_page filter=interactive`. The resume card contains a link with the accessible name `Resume studying` that points to `/study`.
- **Header signed in.** Read the header. Run `read_page filter=interactive`. It lists the `HanziMind` link to `/`, links `Study`, `Decks`, `Dictionary`, and `Profile`, a button named `Toggle light and dark theme`, and a link named `Your profile` to `/profile`. The `Your profile` link shows the single letter `V` and its `title` attribute is `Verify Learner`. As the admin the letter is also `V` and the title is `Verify Admin`. No `Sign In` or `Get Started` link is present.
- **Theme toggle.** Switch the theme. Run `find "Toggle light and dark theme button"` then `computer left_click ref=<toggle>`. The `html` element gains the `dark` class and the icon swaps from a moon to a sun. Confirm with `computer screenshot save_to_disk=true` before and after. Click again to restore light so later screenshots match.
- **Admin menu.** Sign out, sign in as `verify-admin@hanzimind.test`, and run `read_page filter=interactive` on `/`. The nav gains a button `Admin` after `Profile`. Run `find "Admin button"` then `computer left_click ref=<admin>`. A menu opens with items `Vocabulary` linking to `/admin/vocab` and `Suggestions` linking to `/admin/suggestions`. As `verify@hanzimind.test` the `Admin` button is absent. Sign back in as the learner before the next bullet.
- **Avatar to profile.** Choose the avatar. Run `find "Your profile link"` then `computer left_click ref=<avatar>`. The URL is `/profile`.
- **Profile page.** Read the card. Run `get_page_text`. The card title reads `Verify Learner`. Under it the description reads `verify@hanzimind.test`. A large tile at the left shows `V`, the same letter as the header avatar. The body reads `Detailed progress and settings are coming soon.` and a button reads `Sign out`. The title is not a heading element, so `find "profile heading"` may miss it. Match the email text instead.
- **Profile nav link.** Return home and use the nav. Run `navigate url="http://localhost:PORT/"`, `find "Profile link"`, then `computer left_click ref=<profile-link>`. The URL is `/profile` again.
- **Sign out.** End the session. Take `computer screenshot save_to_disk=true` first. Run `find "Sign out button"` then `computer left_click ref=<sign-out>`. The button disables while the request runs, a toast reads `Signed out. See you soon!`, and the page routes to `/`. Run `get_page_text`. The heading reads `Master Chinese, one sprout at a time` and the header shows `Sign In` and `Get Started` with no `Your profile` link. Take a second screenshot. The lane's `sessions` row for this user is gone. Read it back with `psql` as the second view.
- **Sign out through the API.** Prove the same from the terminal with the cookie jar from `sign-in.md`. Run `curl -s -o /dev/null -w "%{http_code}" -b jar.txt -H "content-type: application/json" -H "Origin: http://localhost:PORT" -d '{}' http://localhost:PORT/api/auth/sign-out`. The status is `200`. Without the `Origin` header the auth layer refuses the call with `403 MISSING_OR_NULL_ORIGIN`. `POST /api/auth/sign-in/email` accepts the same request with no `Origin` at all, so the sign-in bullet in `sign-in.md` needs no header. A following `curl -s -b jar.txt http://localhost:PORT/api/auth/get-session` returns `null`.
- **Profile while signed out.** Open the page with no session. Run `navigate url="http://localhost:PORT/profile"` then `get_page_text`. The card title reads `Your profile`, the description reads `Manage your account and progress`, the tile shows `?`, and the button is a `Sign in` link to `/signin`. The page does not redirect.
- **Footer links.** Read the footer on any page. Run `read_page filter=interactive`. The footer lists `Resources` linking to `/resources` and `Privacy Policy` linking to `/privacy`. The footer text also shows `HanziMind` and `© 2025`.
- **Privacy page.** Open it. Run `navigate url="http://localhost:PORT/privacy"` then `get_page_text`. The card title reads `Privacy` with `How HanziMind handles your data.` under it, and the body reads `A full privacy policy is on the way. In short: your study data is used only to power your learning experience.` The tab title is `Privacy · HanziMind`. The page has no `h1`. The title is a styled `div`.
- **Resources page.** Open it. Run `navigate url="http://localhost:PORT/resources"` then `get_page_text`. The card title reads `Resources` with `Guides and learning resources for studying Chinese with HanziMind.` under it, and the body reads `We're putting together study guides, tips on stroke order, and more. Check back soon.` The tab title is `Resources · HanziMind`. As with `/privacy`, there is no `h1`.
- **Proof.** For `sign-out`, keep the before screenshot showing the `Sign out` button and the profile email, the after screenshot showing the landing page with `Sign In` and `Get Started`, and the `read_page` output for both header states.

## Gotchas

- There is no header user menu. The avatar is a plain link named `Your profile`, and `Sign out` exists only on `/profile`. A recipe that expects a dropdown with a sign-out item will fail.
- The dashboard numbers are fixed copy. `5 day streak`, `20 Reviews ready today`, `150 Items learned`, and `Continue · HSK 1 Standard Course` appear for a fresh account with no decks and no progress. Do not treat them as evidence of stored state, and do not expect them to change after a study session.
- While the session is loading, `/` shows only a spinner and `/profile` shows a `User` icon and the title `Your profile` with no button. Wait for `Welcome back!` or for `verify@hanzimind.test` before reading.
- The profile card title and the `/privacy` and `/resources` titles are `div` elements, not headings. `find` queries phrased as "heading" can miss them. Match on text with `get_page_text`.
- The nav links and the `Admin` dropdown are hidden below the `sm` breakpoint. Below 640px the header shows only the logo, the theme toggle, and the avatar or the two auth buttons.
- The `Admin` link is cosmetic. Its absence for the learner proves nothing about access control. Admin endpoint enforcement is covered in `admin-vocab.md` and `admin-suggestions.md`.
- The theme choice persists in the browser tab's storage. A toggle left on dark changes every later screenshot in this tab. Restore light after the theme bullet.
- Signing out clears the client query cache. If the harness then navigates back to `/decks` or `/study`, expect the signed-out variants of those pages, not a stale signed-in view.
- The sign-out toast lasts a few seconds. Read it right after the click or rely on the header state change as the observable result.
- Sign-out failure shows `Couldn't sign out. Please try again.` and re-enables the button. That only happens if the auth endpoint is unreachable, which `doctor.sh` should have caught.
