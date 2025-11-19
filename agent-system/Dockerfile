FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY . .

# Install tsx globally for running TypeScript
RUN npm install -g tsx

# Create symlink so /shared can access node_modules
RUN mkdir -p /shared && ln -s /app/node_modules /shared/node_modules

# Expose port for health checks (optional)
EXPOSE 3001

# Run the agent manager
CMD ["tsx", "agent-manager.ts"]
