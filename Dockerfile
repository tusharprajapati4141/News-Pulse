# News Pulse - single image with both Node (backend) and Python (scraper),
# so POST /ingest/trigger can actually spawn the scraper in production.
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend ./backend
COPY scraper ./scraper
COPY data ./data

# Python deps for the scraper
RUN pip3 install --no-cache-dir --break-system-packages -r scraper/requirements.txt

# Node deps for the backend
WORKDIR /app/backend
RUN npm install --omit=dev

EXPOSE 4000
CMD ["npm", "start"]
