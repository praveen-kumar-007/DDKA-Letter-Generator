# Deployment Guide - DDKA Letter Generator

## Production Deployment to Vercel

This guide walks through deploying the DDKA Letter Generator to Vercel for production use.

### Prerequisites

- GitHub account with the project repository
- Vercel account (free tier available)
- Node.js 18+ locally installed

### Quick Deploy

#### Option 1: Deploy from GitHub (Recommended)

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "Production ready DDKA Letter Generator"
   git push origin main
   ```

2. **Import in Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New..." → "Project"
   - Select your repository
   - Click "Import"

3. **Configure Project**
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)
   - **Environment Variables**: Leave empty (or add custom vars as needed)
   - Click "Deploy"

4. **Custom Domain** (Optional)
   - In Vercel Dashboard → Settings → Domains
   - Add your custom domain
   - Update DNS records as instructed

#### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Navigate to frontend directory
cd frontend

# Deploy
vercel

# For production
vercel --prod
```

### Configuration Files

The project includes several configuration files for Vercel:

**`vercel.json`**

- Build command configuration
- Output directory specification
- Environment variables
- Cache control headers
- Routing rewrites for SPA

**`.vercelignore`**

- Excludes unnecessary files from deployment
- Reduces deployment size and time
- Includes: node_modules, .git, dist, etc.

### Environment Variables

Set environment variables in Vercel Dashboard:

1. Go to Project Settings → Environment Variables
2. Add variables as needed (currently none required)
3. Common examples:
   ```
   VITE_APP_TITLE=DDKA Letter Generator
   VITE_API_BASE_URL=https://api.example.com
   ```

### Performance Optimization

The production build includes:

✅ **Code Minification**

- Terser compression enabled
- Tree-shaking removes unused code
- Console logs stripped in production

✅ **Code Splitting**

- Vendor libraries split into separate chunk
- React/ReactDOM in separate bundle
- jsPDF in separate bundle for optimal loading

✅ **Caching**

- Assets cached for 1 year (immutable)
- HTML not cached (always fresh)
- Proper cache headers configured

✅ **Asset Optimization**

- CSS minified
- JavaScript minified and mangled
- Source maps disabled in production

### Monitoring & Analytics

After deployment, monitor your application:

1. **Vercel Analytics**
   - Dashboard shows deployment history
   - Real-time deployment logs
   - Environment overview

2. **Error Tracking**
   - Monitor error logs in Vercel dashboard
   - Set up error notifications

3. **Performance**
   - Web Vitals monitoring available
   - Edge function analytics

### Rollback

To rollback to a previous deployment:

1. Go to Vercel Dashboard → Deployments
2. Find the previous stable deployment
3. Click "..." → "Promote to Production"

### Custom Domain Setup

Example for custom domain `letters.ddka.com`:

1. In Vercel Dashboard → Settings → Domains
2. Enter your domain
3. Follow DNS configuration:
   - CNAME: `cname.vercel.com`
   - Or update A record to Vercel IP

### Security Best Practices

✅ **HTTPS**: Automatically enabled on all Vercel URLs

✅ **Headers**: Security headers configured in vercel.json

✅ **Environment Secrets**: Use Vercel's environment variable feature for sensitive data

✅ **Access Control**: Configure team access in Vercel settings

### Troubleshooting

**Build Fails**

- Check Node.js version: `node --version` (must be 18+)
- Verify all dependencies installed: `npm install`
- Check for syntax errors: `npm run build` locally first

**Blank Page After Deploy**

- Clear browser cache
- Check browser console for errors
- Verify public assets are being served correctly

**Slow Performance**

- Check bundled asset sizes in dist folder
- Review network tab in browser DevTools
- Consider upgrading Vercel plan for more resources

### Continuous Deployment

Push to main branch automatically triggers deployments:

1. All PRs get preview deployments
2. Merges to main go to production
3. Deployments show in GitHub checks

### Monitoring Logs

```bash
# View real-time logs
vercel logs

# View specific deployment logs
vercel logs [deployment-url]
```

### Health Checks

After deployment:

1. ✅ Navigate to your deployed URL
2. ✅ Test all features (create letter, export PDF)
3. ✅ Test responsive design (mobile view)
4. ✅ Check browser console for errors
5. ✅ Verify PDF export works

### Database/API Integration (Future)

When adding backend:

1. Add API endpoint to environment variables
2. Update App.jsx to use environment variable
3. Set CORS properly if cross-origin
4. Use serverless functions in Vercel if needed

### Support

For Vercel-specific issues:

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Support](https://vercel.com/support)

For application issues:

- Check logs in Vercel dashboard
- Review browser console errors
- Test locally with `npm run build && npm run preview`
