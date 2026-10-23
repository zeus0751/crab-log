---
title: "CrabMetrics Data Transfer: Setup Guide"
subtitle: "Google Sheet + Apps Script, version 1.0 (app 1.0.0-g1)"
date: "October 23, 2026"
---

**What it is.** The **Data Transfer** button sends your finished trips from the tablet into the Google Sheet **CrabMaster_Data_v3**. You see a preview first, then the app writes the rows, reads them back from the sheet, compares them with what is on the tablet, and only then marks the trips as sent. The paste route (Export, Excel master paste file) still works as a fallback and needs no Google account.

**Status.** Built and tested against a stand-in for Google (the script's own code running against a simulated sheet, with the real app). **It has not yet run against a real Google Sheet.** Do the first transfer on a copy.

# Part 1. One-time setup (about 20 minutes, on your Mac)

## 1. Make the Google Sheet
1. Copy `CrabMaster_Data_v3.xlsx` (in `CrabbingApp/master/`) to Google Drive and open it with Google Sheets (right-click → Open with → Google Sheets).
2. **File → Save as Google Sheets.** Rename it **CrabMaster_Data_v3**. (Later versions: rename the sheet; nothing breaks, the script lives inside it.)
3. Check the tabs: README, Compare_Years, Trips, Loops, Lists, Dictionary, Review_Items. Check that Trips columns B, E, F, I, L and AN to AR show nothing on empty rows and that the two charts on Compare_Years look right. Tell me what looks different and I will adjust.

## 2. Install the script
1. In the sheet: **Extensions → Apps Script.**
2. Delete the sample code. Open `CrabMetrics_DataTransfer.gs` (in `CrabbingApp/google-script/`), copy everything, paste it in.
3. Change the line `const SECRET = 'PASTE-YOUR-KEY-HERE';` to your own key: at least 16 letters and numbers, no spaces or quotation marks (for example 24 random characters). Write it down; you will type it into the tablet too.
4. Click the disk icon (Save). Name the project CrabMetrics Data Transfer.

## 3. Deploy it
1. **Deploy → New deployment.** Gear icon → **Web app.**
2. *Description:* v1. *Execute as:* **Me.** *Who has access:* **Anyone.** (The key is what protects it: without the key, every request is refused.)
3. **Deploy.** Google asks you to authorize. Choose your account. If it warns "Google hasn't verified this app", click **Advanced → Go to CrabMetrics Data Transfer (unsafe)** (it is your own script) → **Allow.**
4. Copy the **Web app URL** (starts with `https://script.google.com/macros/s/` and ends with `/exec`).

## 4. Tell the tablet
Get the URL onto the tablet (email it to yourself, or put it in a Drive note). In CrabMetrics: **Settings → Data Transfer (Google Sheet):**
1. **Set** the web address (paste the URL).
2. **Create key / Show** → type the same key → **Save key.**
3. **Test connection.** It should say: Connected to "CrabMaster_Data_v3".

# Part 2. Using it

1. Home → **Data Transfer** (also on the "Trip complete" screen). Needs Wi-Fi.
2. **Check what will transfer.** The preview lists each trip as *new*, *changed* (with the changed fields) or *already there*, and the loops that are new, changed or removed.
3. **Transfer now.** The app writes, reads back, compares. **Transfer complete and verified** means the trips are marked as sent (History shows ✔).
4. If it says **CHECK FAILED**, nothing is marked as sent. Read the message, tell me, and run *Check* again to see the sheet's state.

**Compare ALL trips with the sheet** checks everything, including history, and is a good monthly sanity check. It changes nothing until you confirm.

# Rules the script follows

- New trips go into the first empty row. Formula columns are never written.
- A trip already in the sheet is matched by Trip ID. If any field differs it is shown as *changed* and updated in place, only after you confirm. Loops are matched by Loop ID; a loop you deleted in the app is cleared in the sheet (shown as "removed").
- Nothing is ever duplicated. If the sheet has no empty row left, or the next row has no formulas, the script stops and changes nothing; tell me and I will extend the formulas.
- Wrong key: refused.

# If something goes wrong

| Message | Meaning / fix |
|---|---|
| Could not reach Google | No Wi-Fi, or the address is wrong |
| Google did not answer as expected | The address is wrong, or the deployment is not set to "Anyone" |
| The key does not match | The key in the script and in Settings differ (check for a stray space) |
| No empty row left / has no formulas | Extend the Trips (to row 520) or Loops (to row 2000) formulas down; tell me |
| CHECK FAILED | The sheet holds something different from what was sent; nothing was marked |

After **any change to the script** you must **Deploy → Manage deployments → Edit → New version → Deploy**, or the old version keeps running.

# Privacy and limits

The web address and key are stored only on the tablet. They are not in backup files or on GitHub. Anyone who had both could add trips to the sheet, so do not share them. Transfers need internet; recording trips does not. If you ever distribute the app, each user would need their own sheet and script, or the design would have to change.
