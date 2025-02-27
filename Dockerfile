FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the source code
COPY . .

# Build TypeScript
RUN npm run build

# Start the service
CMD ["npm", "start"] 