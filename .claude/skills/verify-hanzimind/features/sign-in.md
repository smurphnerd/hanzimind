# Sign in

A visitor lands on a marketing page at `/`, signs in with email and password at `/signin`, creates an account at `/signup` and confirms it through a verification email, and lands on `/verified` after the link is clicked. A wrong password or an unverified account is refused with a toast, and the header changes from `Sign In` and `Get Started` to a profile avatar once a session exists.

## Sub-features

- `signin-landing` shows the signed-out landing page at `/` with its two calls to action.
- `signin-form` renders the `/signin` card with `Email`, `Password`, and `Sign In`.
- `signin-validation` rejects a malformed email or a short password inline before any request.
- `signin-wrong-password` refuses a wrong password with a toast and stays on `/signin`.
- `signin-success` signs in the seeded learner, redirects to `/`, and swaps the header to the avatar.
- `signin-unverified` refuses a sign-in for an account whose email is not verified.
- `signin-redirect-param` honors `?redirectUrl=` and returns the user to that page after sign in.
- `signup-form` renders the `/signup` card with `Username`, `Email`, `Password`, and `Create Account`.
- `signup-validation` rejects a short username, a malformed email, or a short password inline.
- `signup-success` creates the account, swaps the card to `Almost there!`, and sends a verification email to the lane's Mailpit.
- `signup-duplicate` refuses an email that already has an account.
- `verified-page` shows `You're all set!` at `/verified`, with a different button depending on whether a session exists.

## How to get to it (user POV)

- Open `http://localhost:PORT/` while signed out. It shows the landing page with `Log in` and `Start learning`.
- Choose `Sign In` in the header, `Log in` on the landing page, or open `http://localhost:PORT/signin`.
- Choose `Get Started` in the header, `Start learning` on the landing page, the `Sign up` link at the bottom of the sign-in card, or open `http://localhost:PORT/signup`.
- Open a signed-in-only page while signed out. `/decks/new` redirects the visitor to `/signin?redirectUrl=<path>`. `/admin/*` stays on its URL and renders a `Sign in required` card whose `Sign In` link points at `/signin?redirectUrl=<path>`, and the `Report a problem` dialog on a dictionary entry offers the same link.
- Click `Verify Email` in the verification email. It lands on `http://localhost:PORT/verified`.
- Open `http://localhost:PORT/verified` directly. It renders in either session state.

## Driving it with claude-in-chrome

Preconditions:

- A lane is up and `scripts/doctor.sh <n>` printed four `ok` lines. `PORT` is the lane's dev port.
- The lane was seeded with `SEED_TEST_USER=1`, so `verify@hanzimind.test` / `verify-hanzimind` exists, is verified, and has the display name `Verify Learner`.
- The lane's Mailpit is reachable at `http://localhost:<mailpit web port>`. `lane-up.sh` prints that port. Its inbox is empty or its contents are known before the sign-up bullet runs.
- The browser tab for this lane was opened with `tabs_create_mcp` and no session cookie is set. If a session is present, open `/profile` and choose `Sign out` first (see `profile-and-signout.md`).

- **Landing page.** Open the app signed out. Run `navigate url="http://localhost:PORT/"` then `get_page_text`. The heading reads `Master Chinese, one sprout at a time`, the line `学中文，懂中国` sits under it, and two links read `Log in` and `Start learning`. The header shows `HanziMind`, a button named `Toggle light and dark theme`, and links `Sign In` and `Get Started`. No `Study`, `Decks`, `Dictionary`, or `Profile` links are present.
- **Landing to sign in.** Choose `Log in`. Run `find "Log in link"` then `computer left_click ref=<log-in>`. The URL is `/signin` and the heading reads `Welcome Back`.
- **Sign-in form.** Read the form. Run `read_page filter=interactive`. It lists an `Email` textbox, a `Password` textbox, a `Sign In` button, and a `Sign up` link. Neither input has a placeholder, so locate them by label. The mascot image has the accessible name `Mika the red panda`.
- **Validation.** Submit a well-formed email with a short password. Run `find "Email input"` then `form_input ref=<email> value="verify@hanzimind.test"`, then `find "Password input"` then `form_input ref=<password> value="short"`, then `find "Sign In button"` then `computer left_click ref=<sign-in>`. One alert appears under the password field, `Password must be at least 8 characters`, the URL is still `/signin`, and no request is sent. Confirm with `get_page_text`. A malformed email such as `not-an-email` never reaches the form's own validation: the input is `type="email"`, so the browser blocks the submit with a native tooltip and the `Please enter a valid email` alert does not render.
- **Wrong password.** Submit a real email with a wrong password. Run `form_input ref=<email> value="verify@hanzimind.test"` then `form_input ref=<password> value="wrong-password-1"` then `computer left_click ref=<sign-in>`. A toast reads `Invalid email or password. Please try again.`, the URL is still `/signin`, and the header still shows `Sign In` and `Get Started`. Capture it with `computer screenshot save_to_disk=true` before the toast fades. The toast sits outside `<main>`, so `get_page_text` never shows it; screenshot or `find "toast"` within a few seconds of the click.
- **Sign in as the seeded learner.** Submit the seeded credentials. Run `form_input ref=<email> value="verify@hanzimind.test"` then `form_input ref=<password> value="verify-hanzimind"` then `computer left_click ref=<sign-in>`. A toast reads `Signed in successfully!` and the page performs a full navigation to `/`. Run `get_page_text`. The dashboard heading reads `Welcome back!`. Run `read_page filter=interactive`. The header now lists links `Study`, `Decks`, `Dictionary`, and `Profile`, the `Toggle light and dark theme` button, and a link with the accessible name `Your profile` that points to `/profile`. That link is the avatar. Its visible content is the single letter `V`, the first character of the seeded display name `Verify Learner`, and its `title` attribute is `Verify Learner`. There is no dropdown behind it. `Sign In` and `Get Started` are gone.
- **Sign in through the API.** Prove the same account from the terminal. Run `curl -s -o /dev/null -w "%{http_code}" -c jar.txt -H "content-type: application/json" -d '{"email":"verify@hanzimind.test","password":"verify-hanzimind"}' http://localhost:PORT/api/auth/sign-in/email`. The status is `200` and `jar.txt` gains a session cookie for later `curl` bullets in other feature files.
- **Redirect parameter.** Sign out, then open `http://localhost:PORT/signin?redirectUrl=dictionary` and sign in with the seeded credentials as above. The page navigates to `http://localhost:PORT/dictionary` instead of `/`. The value is a path without a leading slash and is always resolved under the app's own origin.
- **Sign-up form.** Open the sign-up page signed out. Run `navigate url="http://localhost:PORT/signup"` then `read_page filter=interactive`. The heading reads `Create Account` with `Begin your Chinese learning journey` under it. The form lists a `Username` textbox with placeholder `johndoe`, an `Email` textbox with placeholder `john@example.com`, a `Password` textbox with no placeholder, a `Create Account` button, and a `Sign in` link.
- **Sign-up validation.** Submit bad values with a well-formed email. Run `find "Username input"` then `form_input ref=<username> value="ab"`, `find "Email input"` then `form_input ref=<email> value="verify-signup@hanzimind.test"`, `find "Password input"` then `form_input ref=<password> value="short"`, then `find "Create Account button"` and `computer left_click ref=<create>`. Two alerts appear, `Username must be at least 3 characters` and `Password must be at least 8 characters`. A username such as `a b` produces `Username can only contain letters, numbers, hyphens, and underscores`. As on `/signin`, a malformed email is stopped by the browser's native `type="email"` check before the form validates.
- **Sign up.** Create a fresh account. Pick an unused address such as `verify-signup-<timestamp>@hanzimind.test`. Run `form_input ref=<username> value="verify-signup"`, `form_input ref=<email> value="<address>"`, `form_input ref=<password> value="verify-hanzimind"`, then `computer left_click ref=<create>`. A toast reads `Account created! Check your email to verify it.` and the card is replaced. Run `get_page_text`. It shows `Check your email`, the heading `Almost there!`, the sentence `We sent a verification link to <address>. Click it to activate your account.`, and buttons `Use a different email` and `Go to sign in`. Then open Mailpit. Run `navigate url="http://localhost:<mailpit web port>"`. The newest message is to `<address>` with subject `Verify your email - Hanzimind`. Open it. The body reads `Hello verify-signup,` and `Welcome to Hanzimind! Please verify your email address by clicking the button below.` with a `Verify Email` button. Screenshot the message with `computer screenshot save_to_disk=true`. This bullet leaves a new row in the lane's `users` table. Read it back with `psql` as the second view.
- **Sign in before verifying.** Try to sign in as the new account. Run `navigate url="http://localhost:PORT/signin"`, fill `<address>` and `verify-hanzimind`, and click `Sign In`. A toast reads `Please verify your email address. Check your inbox for the verification link.` and the URL stays on `/signin`. This may also trigger a second verification email in Mailpit.
- **Verify by email link.** In the Mailpit message, click `Verify Email` or copy its `href` and run `navigate url="<href>"`. The browser lands on `http://localhost:PORT/verified`. Because verification signs the user in, the card shows `Email verified`, the heading `You're all set!`, the sentence `Your account is verified and you're signed in. Time to grow your first sprout.`, and a `Start studying` link to `/study`. The header shows the `Your profile` avatar.
- **Verified page while signed out.** Sign out and open the page directly. Run `navigate url="http://localhost:PORT/verified"` then `get_page_text`. The heading still reads `You're all set!`, but the sentence reads `Your email address has been confirmed. Sign in to start learning.` and the button is a `Sign in` link to `/signin`.
- **Duplicate sign-up.** Return to `/signup` and submit the seeded learner's email `verify@hanzimind.test` with any valid username and password. A toast reads `An account with this email already exists. Please sign in instead.` and the form stays on screen.
- **Proof.** For `signin-success`, capture one screenshot of the filled `/signin` form and one of the `/` dashboard with the `Your profile` avatar visible, both with `computer screenshot save_to_disk=true`, plus the `read_page filter=interactive` output that lists the avatar link. For `signup-success`, capture the `Almost there!` card and the Mailpit message.

## Gotchas

- Every failure on `/signin` and `/signup` is a toast, not an inline error. Toasts disappear after a few seconds and sit outside `<main>`, so `get_page_text` never shows them; screenshot or `find "toast"` immediately after the click. The only inline errors are the schema alerts in the validation bullets.
- Sign-in validation runs in the browser first. A password shorter than 8 characters never reaches the server, so a "wrong password" test must use a password of at least 8 characters to exercise the server path.
- A successful sign-in sets `window.location`, a full page load, not a client route change. Wait for the `Welcome back!` heading before reading the header, or the harness may read the pre-navigation DOM.
- The avatar is a link named `Your profile`, not a menu. Clicking it navigates to `/profile`. Do not look for a dropdown or a `Sign out` item in the header. The only header dropdown is `Admin`, and it appears only for `verify-admin@hanzimind.test`.
- The nav links `Study`, `Decks`, `Dictionary`, and `Profile` are hidden below the `sm` breakpoint. Keep the tab wider than 640px or `read_page` will not list them.
- The sign-up mutation resets the form on success. Choosing `Use a different email` returns to an empty form, not the values just submitted.
- `requireEmailVerification` is on. A fresh account cannot sign in until the link is clicked, and clicking it signs the user in automatically, so `/verified` after the link shows the signed-in variant without a separate sign-in.
- The verification email is sent without awaiting delivery. Reload Mailpit once if the message is not there on the first load.
- Each sign-up leaves a `users` row and a `verifications` row in the lane database. Use a fresh address each run or expect the duplicate-account toast.
- Rate limiting is on in the auth layer. Repeating the wrong-password bullet many times in a short window can turn the toast into a generic failure. Space attempts out or restart the lane.
- The landing heading is split across a styled span. `get_page_text` returns `Master Chinese, one sprout at a time` as one line; `find` by a partial phrase such as `sprout` is more reliable than the full sentence.
