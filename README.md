# DDKA Letter Generator

A professional letter generation tool built for DDKA (Dhanbad District Kabaddi Association) with customizable text styling and PDF export capabilities.

## Features

✨ **Premium Letter Creation**

- Customize reference numbers and dates
- Create dynamic headings with color support
- Write body text with formatting options
- Real-time preview of your letter

🎨 **Advanced Text Styling**

- Bold individual words using `**text**` syntax
- Change text color with `{color:#HEX}text{/color}` syntax
- Combine multiple styling options
- Color picker for precise color selection

📄 **PDF Export**

- Export formatted letters as PDF
- Maintains all styling and colors
- Professional letterhead integration
- One-click download

📱 **Responsive Design**

- Works seamlessly on desktop and mobile
- Touch-friendly interface
- Optimized for all screen sizes

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

1. **Enter Reference Number**: Add your letter reference number
2. **Select Date**: Choose the letter date (defaults to today)
3. **Add Heading**: Enter your letter heading with optional color
4. **Write Body**: Compose your letter with text styling
5. **Format Text**:
   - Wrap text in `**` to make it bold: `**bold text**`
   - Wrap text with color markers: `{color:#FF0000}red text{/color}`
6. **Preview**: Toggle preview to see the final result
7. **Export**: Click "Make PDF" to download your letter

## Text Formatting Examples

```
**Bold text** - Renders as bold

{color:#1a237e}Blue text{/color} - Renders in blue

{color:#FF0000}**Red bold**{/color} - Combines color and bold
```

## Project Structure

```
frontend/
├── public/
│   ├── favicon.svg
│   ├── letter-head.jpg
│   └── manifest.json
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── README.md
```

## Technologies

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **jsPDF** - PDF generation
- **HTML2Canvas** - Canvas rendering
- **CSS3** - Styling with animations

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Set the root directory to `frontend`
4. Deploy

The project includes:

- `vercel.json` - Vercel configuration
- `.vercelignore` - Files to exclude from deployment
- Optimized build settings for production

## Performance

- Tree-shaking enabled for unused code removal
- Code splitting for vendor libraries
- Production builds optimized with terser
- Lazy loading for images
- Caching headers configured

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT

## Support

For issues and feature requests, please contact DDKA support.
