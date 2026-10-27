# CI/CD Pipeline Setup Guide

This document provides a quick reference for setting up and using the CI/CD pipeline.

## First-Time Setup

### 1. Configure GitHub Secrets

Go to your GitHub repository: **Settings > Secrets and variables > Actions > New repository secret**

Add the following secrets:

| Secret Name      | Value                         | How to Get It                                  |
| ---------------- | ----------------------------- | ---------------------------------------------- |
| `SERVER_IP`      | Your production server IP     | Check your server provider dashboard           |
| `SERVER_USER`    | SSH username (usually `root`) | Your server SSH username                       |
| `SERVER_SSH_KEY` | Your SSH private key          | Generate with `ssh-keygen` or use existing key |

**To get your SSH private key:**

```bash
# On your local machine
cat ~/.ssh/id_rsa

# Copy the entire output including:
# -----BEGIN RSA PRIVATE KEY-----
# ... key content ...
# -----END RSA PRIVATE KEY-----
```

### 2. Verify Server Setup

Ensure your production server has:

- Node.js 20.x installed
- PostgreSQL running with database created
- FalkorDB running on 6380 (Redis with the graph module loaded)
- Redis running on 6379 (concurrency counters and RBAC permission cache)
- PM2 installed globally: `npm install -g pm2`
- The application directory exists

Throughout this guide, `$APP_DIR` is the deploy target configured in
`.github/workflows/deploy.yml` and `deploy.sh`, and `$BACKUP_DIR` is the
sibling backup directory `deploy.sh` writes to. The PM2 application is named
`sftwtrs`.

### 3. Server Environment Variables

On your production server, create `$APP_DIR/.env` with all required environment variables:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/sftwtrs
NODE_ENV=production
PORT=5001
APP_URL=https://your-domain.com
SESSION_SECRET=your-random-32-chars
JWT_SECRET=your-random-32-chars
REDIS_URL=redis://localhost:6379

# Add other required variables (OPENAI_API_KEY, FALKORDB_URL, SMTP, etc.)
```

## Usage

### Automatic Deployment

Simply push to the `main` branch:

```bash
git push origin main
```

The deployment workflow will automatically:

1. Run CI checks (build, type-check, lint, format, security)
2. Build the application
3. Deploy to your server
4. Run database migrations
5. Restart PM2 services
6. Perform health checks

### Manual Deployment

**From GitHub Actions UI:**

1. Go to **Actions** tab in your repository
2. Select **Deploy to Production** workflow
3. Click **Run workflow** button
4. Select `main` branch
5. Click **Run workflow**

**Directly on Server:**

```bash
ssh user@your-server-ip
cd $APP_DIR
./deploy.sh
```

## Monitoring

### Check Deployment Status

**On GitHub:**

- Actions tab: See running/completed workflows
- Deployments: View deployment history

**On Server:**

```bash
# Check application status
pm2 status

# View logs
pm2 logs

# View latest backup
ls -la $BACKUP_DIR/ | tail -5
```

### Common Commands

```bash
# Restart application
pm2 restart all

# Stop application
pm2 stop all

# View detailed logs
pm2 logs sftwtrs

# Monitor in real-time
pm2 monit
```

## Troubleshooting

### Deployment Fails on GitHub Actions

1. Check the Actions tab for error details
2. Verify GitHub secrets are correctly configured
3. Ensure server is reachable via SSH from GitHub

### Application Not Starting After Deployment

```bash
# SSH to server
ssh user@your-server-ip

# Check PM2 logs for errors
pm2 logs

# Verify .env file exists
cat $APP_DIR/.env

# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Manually restart application
pm2 restart all
```

### Health Check Fails

The health check tries these endpoints:

1. `http://your-server:5001/health`
2. `http://your-server:5001/`

If both fail, check:

```bash
# Verify application is running
pm2 status

# Check if port 5001 is listening
netstat -tlnp | grep 5001

# Test locally on server
curl http://localhost:5001
```

### Rollback to Previous Version

```bash
# SSH to server
ssh user@your-server-ip

# List available backups
ls -la $BACKUP_DIR/

# Restore from backup (example: backup_20260206_140000)
cd $APP_DIR
rm -rf dist
cp -r $BACKUP_DIR/backup_20260206_140000/dist ./
cp $BACKUP_DIR/backup_20260206_140000/.env ./

# Restart services
pm2 restart all

# Verify
pm2 status
```

## CI Workflow Details

The CI workflow runs on **every push and pull request** and includes:

### 1. Build Job

- Installs dependencies with caching
- Builds client application
- Builds server application
- Uploads build artifacts

### 2. Type Check Job

- Runs TypeScript compiler
- Validates types across entire monorepo

### 3. Lint Job

- Runs ESLint on all projects
- Checks code quality and standards

### 4. Format Check Job

- Validates code formatting with Prettier
- Ensures consistent code style

### 5. Security Scan Job

- Runs `npm audit`
- Reports dependency vulnerabilities
- Fails on critical vulnerabilities

## Best Practices

1. **Always test changes locally first**

   ```bash
   npm run build
   npm run check
   npm run lint
   ```

2. **Use feature branches**

   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git push origin feature/new-feature
   # Create PR to main
   ```

3. **Monitor deployments**
   - Watch the GitHub Actions workflow
   - Check PM2 logs after deployment
   - Verify functionality in production

4. **Keep backups**
   - Backups are automatically created
   - Clean up old backups periodically

   ```bash
   # Keep last 10 backups, delete older ones
   cd $BACKUP_DIR
   ls -t | tail -n +11 | xargs rm -rf
   ```

5. **Database migrations**
   - Test migrations locally first
   - Backup database before major schema changes
   - Review migration SQL before deploying

## Security Notes

- SSH private keys in GitHub Secrets are encrypted
- Never commit `.env` files to repository
- Regularly update dependencies (`npm update`)
- Review security scan results in CI workflow
- Use strong passwords for database and services

## Support

For issues or questions:

1. Check GitHub Actions logs
2. Review PM2 logs on server
3. Verify all environment variables are set
4. Ensure database and Redis are running
