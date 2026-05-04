FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl cron && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir gkeepapi python-dotenv "urllib3<2"

COPY package.json ./
RUN npm install

COPY keep_sync.py anylist_sync.mjs sync.sh run.sh ./
RUN chmod +x sync.sh run.sh

RUN echo "0 * * * * root /app/sync.sh >> /data/keep2anylist.log 2>&1" > /etc/cron.d/keep2anylist && \
    chmod 0644 /etc/cron.d/keep2anylist

CMD ["/app/run.sh"]
