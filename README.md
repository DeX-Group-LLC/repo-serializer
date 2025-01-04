# repo-serializer

📄 A command-line tool that creates a human-readable snapshot of your codebase. It generates two files:
- A tree view of your repository structure
- A single, well-formatted file containing all text-based source code

Perfect for code reviews, documentation, archiving, or sharing code snippets without sending the entire repository.

## Installation

```bash
npm install -g repo-serializer
```

## Usage

### Command Line

```bash
# Basic usage (current directory)
repo-serialize

# Specify a different directory
repo-serialize -d /path/to/repo

# Specify output directory
repo-serialize -o /path/to/output

# Custom output filenames
repo-serialize --structure-file structure.txt --content-file content.txt

# Add additional ignore patterns
repo-serialize --ignore "*.log" "temp/" "*.tmp"
```

### Programmatic Usage

```javascript
const { serializeRepo } = require('repo-serializer');

serializeRepo({
    repoRoot: '/path/to/repo',
    outputDir: '/path/to/output',
    structureFile: 'structure.txt',
    contentFile: 'content.txt',
    additionalIgnorePatterns: ['*.log', 'temp/']
});
```

## Output Format

### Structure File
Shows the repository's file and folder structure in a tree format:
```
repo/
├── src/
│   ├── index.js
│   └── utils/
│       └── helper.js
└── package.json
```

### Content File
Contains the contents of all text files, clearly marked with headers and footers:
```
>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
FILE: src/index.js
>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
[file contents here]
<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
END FILE: src/index.js
<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
```

## Features

- Respects `.gitignore` files (including nested ones)
- Intelligently detects text files
- Excludes binary files automatically
- Customizable ignore patterns
- Pretty-printed directory structure
- Clear file content separation
- Supports nested directories
- Handles large repositories efficiently

## Default Ignored Patterns

- `.git/`
- `package-lock.json`
- `node_modules/`
- All patterns from `.gitignore` files

## License

MIT
