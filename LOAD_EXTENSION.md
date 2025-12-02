# How to Load the Extension in Chrome

## Step-by-Step Instructions

1. **Open Chrome Extensions Page**
   - Type `chrome://extensions/` in the address bar
   - Press Enter

2. **Enable Developer Mode**
   - Toggle the switch in the **top right corner** that says "Developer mode"
   - It should turn blue/on

3. **Click "Load unpacked"**
   - This button appears in the **top left** after enabling Developer Mode
   - Do NOT click "Pack extension" (that's for creating ZIP files)

4. **Select Your Folder**
   - A file picker will open
   - Navigate to: `C:\Users\Jk4li\MBC`
   - **Select the MBC folder itself** (click on it once, then click "Select Folder")
   - You're selecting the FOLDER, not a file inside it

5. **Verify It Loaded**
   - You should see "Polymarket Relevance Finder" appear in your extensions list
   - If there are errors, check the error messages below the extension card

## Troubleshooting

**If you see a dialog asking for ZIP/CRX:**
- You're on the wrong page or clicked the wrong button
- Go back to `chrome://extensions/`
- Make sure you clicked "Load unpacked" (not "Pack extension")

**If the file picker only shows ZIP files:**
- Change the file type filter dropdown to "All Files" or "Folders"
- Or navigate directly to the folder path

**If you get errors after loading:**
- Check the error messages on the extensions page
- Make sure you ran `npm run build` first
- Verify the `sidebar/` folder exists with `index.html` inside

