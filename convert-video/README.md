# Video converter (for files Watch Together won't play)

If a movie plays sound but shows no picture (or won't load at all) in
Watch Together, it's almost always a video codec the browser can't
decode — HEVC/x265 is the most common culprit. This folder fixes that.

## How to use it

1. Double-click **`Convert Video.bat`**.
   - If you drag a video file (or several) onto it instead of just
     double-clicking, it converts those directly.
   - If you just double-click it, a normal "Open" window pops up —
     pick the movie file there.
2. The first time you ever run it, it downloads a one-time copy of a
   free tool called ffmpeg (~110MB) into a `tools` folder here. Every
   run after that is instant — no re-download.
3. Wait for it to finish (a console window shows progress). When it's
   done, it opens the folder with the new file selected and shows a
   "conversion complete" popup.
4. Load that new file into Watch Together exactly like any other
   movie — it'll have the same name with `[watch-together]` added
   before the extension.

Nobody else needs to do anything technical: once a file is converted,
share *that* file the same way you'd normally share the movie, and it
plays like any other file would on the other end.

## What it actually does

Re-encodes the video to H.264 + stereo AAC audio in an MP4 container —
the one combination every modern browser plays natively — using
ffmpeg. The original file is left untouched; the converted copy is
saved next to it.
