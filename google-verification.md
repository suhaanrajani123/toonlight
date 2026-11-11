# Getting Google to verify Toonlight

Until this is done, connecting Google Calendar or Gmail shows "Google hasn't verified this app"
and only 100 people can connect. Verification is free for the calendar permission. It takes a
form, a short video, and usually 2 to 6 weeks of waiting.

## What Toonlight asks for

| Permission (scope) | Google's category | What Toonlight does with it |
| --- | --- | --- |
| `calendar.events` | Sensitive | Adds the events and reminders you ask for, removes one on Undo, reads your next 1-2 weeks when you ask about your schedule |
| `gmail.send` | Sensitive | Sends an email only when you press Send on a draft |
| `gmail.readonly` | **Restricted** | Reads sender, subject and first line of your newest inbox mail when you ask about email |

Restricted scopes need a yearly third-party security assessment (CASA), which costs money.
**Recommendation:** submit `calendar.events` and `gmail.send` for verification, and leave
`gmail.readonly` unverified (it keeps working for you and up to 100 people, with the warning).

## Before you submit

1. **Own the domain.** Google wants the home page and privacy page on a domain you can prove you
   own in Search Console. `toonlight.pages.dev` can be verified with the HTML-file method:
   Search Console gives you a file, put it in `docs/`, push, press Verify.
2. **Home page** `https://toonlight.pages.dev/` must say what the app does (the welcome screen does).
3. **Privacy page** `https://toonlight.pages.dev/privacy.html` must describe the Google data use
   (it does, including the Limited Use statement).
4. **Branding** (Google Auth Platform → Branding): app name *Toonlight*, support email, the logo
   (`docs/icons/icon-512.png`), home page, privacy page, authorized domain `toonlight.pages.dev`.

## The form (Google Auth Platform → Verification Center → Prepare for verification)

**How will the scopes be used?** (paste, one per scope)

- *calendar.events:* "Toonlight is a study and productivity assistant. When the user asks a
  character to set a reminder or schedule something, Toonlight creates that event in the user's
  primary calendar and offers Undo, which deletes it. When the user asks about their schedule,
  Toonlight reads the next 7-14 days of events to answer and to avoid double-booking. Event data
  is used only to answer that request, is not stored on our servers, and is not shared."
- *gmail.send:* "When the user asks a character to write an email, Toonlight shows an editable
  draft. The email is sent from the user's account only when they press 'Send with Gmail'.
  Toonlight never sends email automatically."

**Demo video** (unlisted YouTube, about 2 minutes, show the address bar):

1. Open `toonlight.pages.dev`, press Start talking, open the Notebook.
2. Press Connect Google Calendar. Show Google's consent screen with the app name and the permission.
3. In Agent mode type "remind me tomorrow at 4pm to submit lab 3". Show the card, then the event in
   Google Calendar, then press Undo and show it gone.
4. Type "what do I have this week?" and show the answer using the calendar.
5. Connect Gmail, type "write an email to lee@njit.edu saying I'll hand in lab 3 on Friday",
   show the draft, press Send with Gmail, show it in Gmail's Sent folder.
6. Show the OAuth client ID in the consent screen URL (Google asks for this).

## After you submit

Google emails questions to the support address. Answer within a few days or the request closes.
Do not change the scopes while it is in review.
