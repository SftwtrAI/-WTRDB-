#!/bin/bash

#############################################
# Deployment Script for wtropsai
# This script handles safe deployment with
# backup, build, migration, and restart
#############################################

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/root/wtropsai"
BACKUP_DIR="/root/wtropsai-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/backup_${TIMESTAMP}"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handler
error_handler() {
    log_error "Deployment failed at line $1"
    log_error "Check logs above for details"
    exit 1
}

trap 'error_handler $LINENO' ERR

#############################################
# Main Deployment Process
#############################################

log_info "Starting deployment at $(date)"
log_info "Application directory: $APP_DIR"

# Step 1: Create backup
log_info "Creating backup..."
mkdir -p "$BACKUP_DIR"

if [ -d "$APP_DIR/dist" ]; then
    log_info "Backing up current deployment to $BACKUP_PATH"
    mkdir -p "$BACKUP_PATH"
    cp -r "$APP_DIR/dist" "$BACKUP_PATH/" 2>/dev/null || true
    cp "$APP_DIR/.env" "$BACKUP_PATH/" 2>/dev/null || true
    log_info "Backup created successfully"
else
    log_warn "No existing build found, skipping backup"
fi

# Step 2: Navigate to application directory
cd "$APP_DIR"
log_info "Changed to application directory: $(pwd)"

# Step 3: Extract deployment package if it exists
if [ -f "deployment.tar.gz" ]; then
    log_info "Extracting deployment package..."
    tar -xzf deployment.tar.gz
    rm deployment.tar.gz
    log_info "Deployment package extracted"
else
    log_warn "No deployment.tar.gz found, proceeding with existing files"
    
    # Step 4: Install dependencies (only if no deployment package)
    log_info "Installing dependencies..."
    npm ci --production=false
    log_info "Dependencies installed"
    
    # Step 5: Build application (only if no deployment package)
    log_info "Building application..."
    npm run build
    log_info "Build completed"
fi

# Step 6: Run database migrations
log_info "Running database migrations..."
if [ -f ".env" ]; then
    npm run db:push
    log_info "Database migrations completed"
else
    log_error ".env file not found! Cannot run migrations."
    exit 1
fi

# Step 7: Restart PM2 services
log_info "Restarting PM2 services..."

if command -v pm2 &> /dev/null; then
    # Check if PM2 process is already running
    if pm2 list | grep -q "wtropsai"; then
        log_info "Restarting existing PM2 process..."
        pm2 restart ecosystem.config.cjs --env production --update-env
    else
        log_info "Starting new PM2 process..."
        pm2 start ecosystem.config.cjs --env production
    fi
    
    # Save PM2 process list
    pm2 save
    
    log_info "PM2 services restarted"
else
    log_error "PM2 is not installed! Please install PM2: npm install -g pm2"
    exit 1
fi

# Step 8: Health check
log_info "Waiting for application to start..."
sleep 5

log_info "Checking application health..."
if curl -f http://localhost:5000/health &> /dev/null || curl -f http://localhost:5000/ &> /dev/null; then
    log_info "✓ Application is running and healthy!"
else
    log_warn "Health check endpoint not responding, but this may be normal if no health endpoint exists"
    log_warn "Check PM2 logs: pm2 logs"
fi

# Step 9: Display status
log_info "Deployment completed successfully!"
log_info ""
log_info "==== PM2 Status ===="
pm2 status

log_info ""
log_info "==== Useful Commands ===="
log_info "View logs:     pm2 logs"
log_info "Check status:  pm2 status"
log_info "Restart:       pm2 restart all"
log_info "Stop:          pm2 stop all"
log_info ""
log_info "Backup location: $BACKUP_PATH"
log_info "Deployment completed at $(date)"
