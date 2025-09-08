FROM node:18

# Install libatk-bridge2.0-0 for Puppeteer
RUN apt-get update && apt-get install -y libatk-bridge2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

CMD ["npm", "start"]
