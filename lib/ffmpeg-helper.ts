/**
 * Gets the ffmpeg binary path, preferring the bundled @ffmpeg-installer/ffmpeg
 * so it works on Railway/Vercel without system ffmpeg.
 *
 * Install: npm install @ffmpeg-installer/ffmpeg
 */

let _ffmpegPath: string | null = null;

export function getFfmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath;

  // 1. Explicit env override (e.g. FFMPEG_PATH=/usr/bin/ffmpeg)
  if (process.env.FFMPEG_PATH) {
    _ffmpegPath = process.env.FFMPEG_PATH;
    return _ffmpegPath;
  }

  // 2. Bundled binary via @ffmpeg-installer/ffmpeg
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    _ffmpegPath = installer.path;
    console.log('[ffmpeg] Using bundled binary:', _ffmpegPath);
    return _ffmpegPath!;
  } catch {
    // package not installed
  }

  // 3. Fall back to system ffmpeg
  _ffmpegPath = 'ffmpeg';
  return _ffmpegPath;
}