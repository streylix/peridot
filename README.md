# Peridot

A secure, feature-rich note-taking application built with React.

## Test it yourself!

[View website here](https://peridot-iota.vercel.app/)

## Features

- 📝 Rich text editing
- 🔒 End-to-end encryption for sensitive notes
- 📁 Folder organization with drag-and-drop support
- 📌 Pin important notes
- 🌙 Dark mode support
- 🖼️ GIF integration
- 📤 Export to multiple formats (JSON, Markdown, Text, PDF)
- 📥 Import from various formats
- 📊 Note statistics and analytics
- 🔍 Full-text search
- 📱 Responsive design

## Technical Features

- Built with React
- Secure note encryption using Web Crypto API
- Origin Private File System (OPFS) for client-side storage
- File system operations with customizable storage quotas
- Debounced auto-save functionality
- Support for multiple file formats
- Efficient state management

## Development

### Prerequisites

- Node.js (latest LTS version recommended)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/streylix/peridot.git
cd peridot
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173` by default.

### Building for Production

To create a production build:

```bash
npm run build
```

The built files will be available in the `dist` directory.

## Security

Peridot takes security seriously:

- All encrypted notes use AES-GCM encryption
- Encryption keys are derived using PBKDF2
- No data is ever sent to a server - everything stays in your browser
- Passwords are stored securely in the Origin Private File System

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Credits

Created by [Ethan Pae](https://github.com/streylix)

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.