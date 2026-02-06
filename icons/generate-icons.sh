#!/bin/bash
# Generate simple Skynet robot icons

# Create a simple SVG robot icon
cat > icon.svg << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="url(#bg)"/>
  <circle cx="64" cy="56" r="32" fill="#ff9500"/>
  <rect x="44" y="90" width="40" height="24" rx="4" fill="#cc6699"/>
  <circle cx="52" cy="52" r="8" fill="#1a1a2e"/>
  <circle cx="76" cy="52" r="8" fill="#1a1a2e"/>
  <circle cx="52" cy="52" r="4" fill="#00ff88"/>
  <circle cx="76" cy="52" r="4" fill="#00ff88"/>
  <rect x="56" y="64" width="16" height="6" rx="2" fill="#1a1a2e"/>
  <rect x="24" y="44" width="8" height="20" rx="4" fill="#ff9500"/>
  <rect x="96" y="44" width="8" height="20" rx="4" fill="#ff9500"/>
</svg>
SVGEOF

# Check if we have tools available
if command -v rsvg-convert &> /dev/null; then
  for size in 16 32 48 128; do
    rsvg-convert -w $size -h $size icon.svg -o icon${size}.png
  done
  echo "Icons generated with rsvg-convert"
elif command -v convert &> /dev/null; then
  for size in 16 32 48 128; do
    convert -background none icon.svg -resize ${size}x${size} icon${size}.png
  done
  echo "Icons generated with ImageMagick"
else
  echo "No image converter found, using placeholder"
fi

