# Demo GIF Runbook

Target output: docs/demo.gif

Goal:

- Under 10 seconds
- Under 3 MB
- One clean terminal-focused take

Script to record:

1. Open a spec file and remove or change a required field in the shape
2. Save
3. Run ferret lint
4. Show breaking drift output
5. Run ferret review and resolve
6. Run ferret lint again
7. End on: ✓ ferret 12 contracts 0 drift 9ms

Visual rules:

- Large terminal font
- Clean prompt and minimal noise
- Dark theme
- No talking
- No mouse wandering

Windows fastest path (recommended):

1. Install ScreenToGif: https://www.screentogif.com/
2. Record only the terminal window
3. Trim dead frames at start/end
4. Export GIF with optimization enabled
5. Ensure final size is below 3 MB
6. Save as docs/demo.gif

Mac fastest path:

1. Record terminal with QuickTime or CleanShot X
2. Convert and compress at https://ezgif.com/video-to-gif
3. Tune FPS and dimensions until under 3 MB
4. Save as docs/demo.gif

Terminalizer path:

1. Install Terminalizer from https://github.com/faressoft/terminalizer
2. Record the same script
3. Render GIF
4. Save as docs/demo.gif

Verification:

1. Confirm file exists at docs/demo.gif
2. Open README and verify the image renders
3. Keep this command output clean:
   ferret lint
