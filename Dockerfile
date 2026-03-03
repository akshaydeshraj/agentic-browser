FROM node:22-slim

# Install system dependencies for Chrome and Xvfb
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chrome runtime dependencies
    wget gnupg ca-certificates \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libasound2 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libpango-1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libappindicator3-1 xdg-utils \
    # Fonts (prevent captcha render issues)
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    # Xvfb for virtual display
    xvfb x11-utils dbus-x11 \
    # Process management
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome Stable (real Chrome, not Chromium)
RUN wget -q -O /tmp/chrome.deb \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update \
    && apt-get install -y /tmp/chrome.deb \
    && rm /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -rm -g appuser -G audio,video appuser

WORKDIR /app

# Install Node dependencies (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Install Patchright's patched Chromium (needed alongside real Chrome)
RUN npx patchright install chromium

# Copy NopeCHA extension
COPY extensions/ ./extensions/

# Copy compiled TypeScript
COPY dist/ ./dist/

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create profiles directory
RUN mkdir -p /data/profiles && chown -R appuser:appuser /data/profiles /app

# Run as non-root
USER appuser

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
