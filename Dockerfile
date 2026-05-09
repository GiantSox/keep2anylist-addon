FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl cron && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m pip install --no-cache-dir gkeepapi python-dotenv "urllib3<2" \
 && python3 -c "import gkeepapi; print('gkeepapi OK')"

COPY package.json ./
RUN npm install

COPY keep_sync.py anylist_sync.mjs sync.sh run.sh ./
RUN chmod +x sync.sh run.sh


CMD ["/app/run.sh"]
