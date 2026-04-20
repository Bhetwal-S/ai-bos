FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create knowledge dirs so data persists via volume
RUN mkdir -p knowledge/departments/council \
    knowledge/departments/finance \
    knowledge/departments/hr \
    knowledge/departments/it \
    knowledge/departments/marketing \
    knowledge/departments/messages \
    knowledge/departments/sales \
    knowledge/departments/legal \
    knowledge/departments/ops

EXPOSE 3001

CMD ["node", "index.js"]
