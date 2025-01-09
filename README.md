# repo-serializer
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=square)](https://opensource.org/licenses/MIT)
[![Tests Status](https://github.com/DeX-Group-LLC/repo-serializer/actions/workflows/tests.yml/badge.svg?style=square)](https://github.com/DeX-Group-LLC/repo-serializer/actions/workflows/tests.yml)
[![Coverage Status](https://coveralls.io/repos/github/DeX-Group-LLC/repo-serializer/badge.svg?branch=main&style=square)](https://coveralls.io/github/DeX-Group-LLC/repo-serializer?branch=main)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.x-brightgreen?style=square)](https://nodejs.org)
[![NPM Version](https://badge.fury.io/js/repo-serializer.svg?style=square)](https://badge.fury.io/js/repo-serializer)
[![Dependencies](https://img.shields.io/librariesio/release/npm/repo-serializer?style=square)](https://libraries.io/npm/repo-serializer)
[![Install Size](https://packagephobia.com/badge?p=repo-serializer)](https://packagephobia.com/result?p=repo-serializer)

📄 A command-line tool that creates a human-readable snapshot of your codebase. It generates two files:
- A tree view of your repository structure
- A single, well-formatted file containing all text-based source code

Perfect for code reviews, documentation, archiving, or sharing code snippets without sending the entire repository.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
  - [Command Line](#command-line)
  - [Programmatic Usage](#programmatic-usage)
- [Output Format](#output-format)
  - [Structure File](#structure-file)
  - [Content File](#content-file)
- [Common Use Cases](#common-use-cases)
- [Default Ignored Patterns](#default-ignored-patterns)
- [Contributing](#contributing)
- [Issues](#issues)
- [License](#license)

## Features

- Respects `.gitignore` files (including nested ones)
- Intelligently detects text files
- Excludes binary files automatically
- Customizable ignore patterns
- Pretty-printed directory structure
- Clear file content separation
- Supports nested directories
- Handles large repositories efficiently

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git (optional, for respecting .gitignore patterns)

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
repo-serialize -s structure.txt -c content.txt

# Add additional ignore patterns
repo-serialize -i "*.log" "temp/" "*.tmp"

# Full CLI Options
repo-serialize [options]

Options:
  # Input/Output Options
  -d, --dir <directory>           Target directory to serialize (default: current working directory)
  -o, --output <directory>        Output directory for generated files (default: current working directory)
  -s, --structure-file <filename> Name of the structure output file (default: repo_structure.txt)
  -c, --content-file <filename>   Name of the content output file (default: repo_content.txt)

  # Processing Options
  -m, --max-file-size <size>      Maximum file size to process (512B-4MB). Accepts units: B, KB, MB
                                  Examples: "512B", "1KB", "4MB" (default: 8KB)
  -a, --all                       Disable default ignore patterns (default: false)
  -g, --no-gitignore              Disable .gitignore processing (enabled by default)
  -i, --ignore <patterns...>      Additional patterns to ignore
  --hierarchical                  Use hierarchical (alphabetical) ordering for content file (default: false)

  # Behavior Options
  -f, --force                     Overwrite existing files without prompting (default: false)
  --silent                        Suppress all console output (default: false)
  --verbose                       Enable verbose logging of all processed and ignored files (default: false)
                                 Note: Cannot be used with --silent

  # Information Options
  -V, --version                   Display the version number
  -h, --help                      Display help information

Examples:
  # Basic input/output usage
  repo-serialize -d ./my-project -o ./output

  # Use hierarchical content ordering
  repo-serialize --hierarchical

  # Disable default ignore patterns
  repo-serialize -a

  # Processing configuration with file size in KB
  repo-serialize -m 1KB -a --no-gitignore -i "*.log" "temp/"

  # Force overwrite without prompting
  repo-serialize -f

  # Run quietly (suppress console output)
  repo-serialize -q

  # Complete example with all option types
  repo-serialize --dir ./project \
                 --output ./analysis \
                 --structure-file tree.txt \
                 --content-file source.txt \
                 --max-file-size 1MB \
                 --all \
                 --no-gitignore \
                 --ignore "*.log" "temp/" \
                 --force \
                 --quiet

  # LLM-optimized snapshot (using 4MB limit)
  repo-serialize -m 4MB -a -o ./llm-analysis
```

### Programmatic Usage

```javascript
const { serializeRepo } = require('repo-serializer');

// Basic usage with default options
await serializeRepo({
    repoRoot: '/path/to/repo',
    outputDir: '/path/to/output'
});


// Advanced usage with all options
await serializeRepo({
    // Input/Output options
    repoRoot: '/path/to/repo',           // Directory to serialize
    outputDir: '/path/to/output',        // Output directory
    structureFile: 'structure.txt',      // Custom structure filename
    contentFile: 'content.txt',          // Custom content filename

    // Processing options
    maxFileSize: 8192,                   // Max file size in bytes (512B-4MB)
    ignoreDefaultPatterns: false,        // Set to true to disable default ignores
    noGitignore: false,                  // Set to true to disable .gitignore processing
    additionalIgnorePatterns: ['*.log'], // Additional patterns to ignore
    hierarchicalContent: false,          // Set to true to use hierarchical (alphabetical) content ordering

    // Behavior options
    force: false,                        // Overwrite without prompting
    silent: false,                       // Suppress all console output
    verbose: false                       // Enable verbose logging (cannot be used with silent)
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

## Common Use Cases

### Code Review Preparation
```bash
# Generate a snapshot before submitting a PR
repo-serialize -o code-review/
```

### Documentation Generation
```bash
# Create a snapshot of your project's current state
repo-serialize --structure-file docs/structure.txt --content-file docs/full-source.txt
```

### Project Archiving
```bash
# Archive a specific version of your codebase
repo-serialize -d ./project-v1.0 -o ./archives/v1.0
```

### LLM Code Analysis
```bash
# Generate files optimized for LLM processing
repo-serialize --max-file-size 5242880 --include-hidden
```

## Default Ignored Patterns

### Always Ignored
These patterns are always ignored and cannot be overridden:
- `.git/`

### Default Ignored
These patterns are ignored by default but can be included using the `-a, --all` flag:
- Hidden files (`.*`)
- Hidden directories (`.*/`)
- `package-lock.json`

## Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/improvement`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -am 'Add new feature'`)
6. Push to the branch (`git push origin feature/improvement`)
7. Create a Pull Request

Please make sure to update tests as appropriate and follow the existing coding style.

## Issues

If you encounter any problems or have suggestions, please [open an issue](https://github.com/DeX-Group-LLC/repo-serializer/issues) on GitHub. Include as much information as possible:

- Your operating system
- Node.js version
- repo-serializer version
- Steps to reproduce the issue
- Expected vs actual behavior

## License

MIT
