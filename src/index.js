const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

/** @constant {number} DEFAULT_MAX_FILE_SIZE - Default maximum file size in bytes (8KB) */
const DEFAULT_MAX_FILE_SIZE = 8192;

/** @constant {number} MIN_FILE_SIZE - Minimum allowed file size in bytes (512B) */
const MIN_FILE_SIZE = 512;

/** @constant {number} MAX_FILE_SIZE - Maximum allowed file size in bytes (4MB) */
const MAX_FILE_SIZE = 4 * 1024 * 1024;

/**
 * Configuration options for repository serialization
 * @typedef {Object} SerializeOptions
 * @property {string} repoRoot - The root directory of the repository to serialize (default: current working directory)
 * @property {string} outputDir - Directory where output files will be written (default: current working directory)
 * @property {string} structureFile - Name of the file to write structure to (default: repo_structure.txt)
 * @property {string} contentFile - Name of the file to write contents to (default: repo_content.txt)
 * @property {string[]} additionalIgnorePatterns - Additional patterns to ignore
 * @property {boolean} [force] - Whether to overwrite existing files without prompting (default: false)
 * @property {boolean} [isCliCall] - Whether this is being called from the CLI (default: false)
 * @property {number} [maxFileSize] - Maximum file size in bytes to process (512B-4MB, default: 8KB)
 * @property {boolean} [ignoreDefaultPatterns] - Whether to disable default ignore patterns (default: false)
 * @property {boolean} [noGitignore] - Whether to disable .gitignore processing (default: false)
 */

/** @constant {string[]} ALWAYS_IGNORE_PATTERNS - Patterns that are always ignored and cannot be overridden */
const ALWAYS_IGNORE_PATTERNS = [
    '.git/',
];

/** @constant {string[]} DEFAULT_IGNORE_PATTERNS - Patterns that are ignored by default but can be included with --all */
const DEFAULT_IGNORE_PATTERNS = [
    '.*',
    '.*/',
    'package-lock.json',
];

/**
 * Parses a file size in bytes from a string
 * @param {number|string} size - The file size in bytes or a string with optional units (B, KB, MB, GB)
 * @returns {number} - The parsed file size in bytes
 */
function parseFileSize(size = DEFAULT_MAX_FILE_SIZE) {
    // If size is undefined or null, return default
    if (size == null) {
        return DEFAULT_MAX_FILE_SIZE;
    }

    // If size is already a number, return it
    if (typeof size === 'number') {
        return size;
    }

    // Convert to string and trim
    const sizeStr = String(size).replace(/\s+/g, '').toUpperCase();

    // Parse with units
    const match = sizeStr.match(/^(\d+)\s*(B|KB|MB|GB)?$/);
    if (!match) {
        throw new Error(`Invalid file size format: ${size}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        default:
        case 'B': return value;
        case 'KB': return value * 1024;
        case 'MB': return value * 1024 * 1024;
        case 'GB': return value * 1024 * 1024 * 1024;
    }
}

/**
 * Pretty-prints a file size in bytes to a human-readable format
 * @param {number} size - The file size in bytes
 * @returns {string} - The pretty-printed file size
 */
function prettyFileSize(size) {
    if (size < 1024) {
        return `${size}B`;
    } else if (size < 1024 * 1024) {
        return `${size / 1024}KB`;
    } else if (size < 1024 * 1024 * 1024) {
        return `${size / (1024 * 1024)}MB`;
    } else {
        return `${size / (1024 * 1024 * 1024)}GB`;
    }
}

/**
 * Checks if a file is a text file and within size limit
 *
 * @param {string} filePath - The path to the file
 * @param {number} maxFileSize - Maximum file size in bytes
 * @returns {boolean} - True if the file is a text file and within size limit
 */
function isTextFile(filePath, maxFileSize) {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size > maxFileSize) {
            return false;
        }

        // Try to read the first chunk of the file to determine if it's text
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(Math.min(maxFileSize, stats.size)); // Read up to 8KB or file size
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        // If file is empty, consider it text
        if (bytesRead === 0) return true;

        // Check for non-printable characters
        for (let i = 0; i < bytesRead; i++) {
            const byte = buffer[i];
            // Allow tabs, newlines, carriage returns and printable ASCII characters
            if (byte !== 0x09 && byte !== 0x0A && byte !== 0x0D && (byte < 0x20 || byte > 0x7E)) {
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error(`Error reading file ${filePath}: ${error.message}`);
        return false;
    }
}

/**
 * Reads gitignore patterns from a directory
 *
 * @param {string} dir - Directory to read patterns from
 * @returns {string[]} - Array of patterns from the gitignore file
 */
function readGitignorePatterns(dir) {
    const gitignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }
    return [];
}

/**
 * Creates initial ignore instance with default patterns
 *
 * @param {string[]} additionalPatterns - Additional patterns to add
 * @param {boolean} [ignoreDefaultPatterns=false] - Whether to skip adding default ignore patterns
 * @returns {Object} - Ignore instance with configured patterns
 */
function createInitialIgnore(additionalPatterns, ignoreDefaultPatterns) {
    const ig = ignore();
    ig.add(ALWAYS_IGNORE_PATTERNS);

    // Add default patterns unless ignoreDefaultPatterns is true
    if (!ignoreDefaultPatterns) {
        ig.add(DEFAULT_IGNORE_PATTERNS);
    }

    if (additionalPatterns.length > 0) {
        ig.add(additionalPatterns);
    }
    return ig;
}

/**
 * Generates the file and folder structure of the repository.
 *
 * @param {string} dir - The directory to traverse.
 * @param {Object} parentIg - The parent ignore instance
 * @param {string} repoRoot - The root directory of the repository.
 * @param {string} prefix - The prefix for indentation.
 * @param {string[]} additionalPatterns - Additional patterns to ignore.
 * @param {boolean} processGitignore - Whether to process .gitignore files
 * @returns {string} - The file and folder structure.
 */
function generateStructure(dir, parentIg, repoRoot, prefix, additionalPatterns, processGitignore) {
    let structure = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Create new ignore instance for this directory
    const ig = ignore().add(parentIg);

    // Add patterns from this directory's .gitignore if it exists and processGitignore is true
    if (processGitignore) {
        const dirPatterns = readGitignorePatterns(dir);
        if (dirPatterns.length > 0) {
            ig.add(dirPatterns);
        }
    }

    // Add root folder name if this is the root level
    if (prefix === '') {
        structure += `${path.basename(dir)}/\n`;
    }

    // Filter and sort entries
    const validEntries = entries
        .filter(entry => {
            const fullPath = path.join(dir, entry.name);
            let relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
                relativePath += '/';
            }
            return !ig.ignores(relativePath);
        })
        .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

    validEntries.forEach((entry, index) => {
        const isLast = index === validEntries.length - 1;
        const fullPath = path.join(dir, entry.name);
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? prefix + '    ' : prefix + '│   ';

        structure += `${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

        if (entry.isDirectory()) {
            structure += generateStructure(fullPath, ig, repoRoot, childPrefix, additionalPatterns, processGitignore);
        }
    });

    return structure;
}

/**
 * Generates a file containing the contents of all text files in the repository.
 *
 * @param {string} dir - The directory to traverse.
 * @param {Object} parentIg - The parent ignore instance
 * @param {string} repoRoot - The root directory of the repository.
 * @param {string[]} additionalPatterns - Additional patterns to ignore.
 * @param {number} maxFileSize - Maximum file size in bytes
 * @param {boolean} processGitignore - Whether to process .gitignore files
 * @returns {string} - The file contents.
 */
function generateContentFile(dir, parentIg, repoRoot, additionalPatterns, maxFileSize, processGitignore) {
    let contentFile = '';
    const entries = fs.readdirSync(dir);

    // Create new ignore instance for this directory
    const ig = ignore().add(parentIg);

    // Add patterns from this directory's .gitignore if it exists and processGitignore is true
    if (processGitignore) {
        const dirPatterns = readGitignorePatterns(dir);
        if (dirPatterns.length > 0) {
            ig.add(dirPatterns);
        }
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);
        let relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, '/');

        if (stats.isDirectory()) {
            relativePath += '/';
        }

        if (ig.ignores(relativePath)) {
            continue;
        }

        if (stats.isDirectory()) {
            contentFile += generateContentFile(fullPath, ig, repoRoot, additionalPatterns, maxFileSize, processGitignore);
        } else if (isTextFile(fullPath, maxFileSize)) {
            contentFile += '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n';
            contentFile += `FILE: ${relativePath}\n`;
            contentFile += '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n';
            contentFile += fs.readFileSync(fullPath, 'utf-8');
            contentFile += '\n';
            contentFile += '<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n';
            contentFile += `END FILE: ${relativePath}\n`;
            contentFile += '<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n';
        }
    }

    return contentFile;
}

/**
 * Main function to serialize the repository.
 * @param {SerializeOptions} options - Configuration options.
 * @param {string} options.repoRoot - The root directory of the repository to serialize.
 * @param {string} options.outputDir - The output directory for generated files.
 * @param {string} [options.structureFile='repo_structure.txt'] - The name of the structure output file.
 * @param {string} [options.contentFile='repo_content.txt'] - The name of the content output file.
 * @param {string[]} [options.additionalIgnorePatterns=[]] - Additional patterns to ignore.
 * @param {boolean} [options.force=false] - Overwrite existing files without prompting.
 * @param {boolean} [options.isCliCall=false] - Whether this is being called from the CLI.
 * @param {number} [options.maxFileSize=8192] - Maximum file size in bytes to process (512B-4MB).
 * @param {boolean} [options.ignoreDefaultPatterns=false] - Ignore default ignore patterns.
 * @param {boolean} [options.processGitignore=true] - Whether to process .gitignore files.
 */
function serializeRepo(options) {
    const {
        repoRoot = process.cwd(),
        outputDir = process.cwd(),
        structureFile = 'repo_structure.txt',
        contentFile = 'repo_content.txt',
        additionalIgnorePatterns = [],
        force = false,
        isCliCall = false,
        maxFileSize = DEFAULT_MAX_FILE_SIZE,
        ignoreDefaultPatterns = false,
        noGitignore = false
    } = options;
    console.log(options);

    // Validate maxFileSize
    if (maxFileSize < MIN_FILE_SIZE || maxFileSize > MAX_FILE_SIZE) {
        throw new Error(`Max file size must be between ${prettyFileSize(MIN_FILE_SIZE)} and ${prettyFileSize(MAX_FILE_SIZE)}`);
    }

    // Check if output files already exist
    const structurePath = path.join(outputDir, structureFile);
    const contentPath = path.join(outputDir, contentFile);

    if (fs.existsSync(structurePath) || fs.existsSync(contentPath)) {
        if (force) {
            const normalizedStructurePath = path.resolve(structurePath);
            const normalizedContentPath = path.resolve(contentPath);
            const normalizedRepoRoot = path.resolve(repoRoot);
            // Delete existing files when force is true
            if (fs.existsSync(structurePath) && normalizedStructurePath.startsWith(normalizedRepoRoot)) {
                // Only add to ignore if the file is within the repo root
                const relativeStructurePath = path.relative(repoRoot, structurePath).replace(/\\/g, '/');
                additionalIgnorePatterns.push('/' + relativeStructurePath);
            }
            if (fs.existsSync(contentPath) && normalizedContentPath.startsWith(normalizedRepoRoot)) {
                // Only add to ignore if the file is within the repo root
                const relativeContentPath = path.relative(repoRoot, contentPath).replace(/\\/g, '/');
                additionalIgnorePatterns.push('/' + relativeContentPath);
            }
        } else if (isCliCall) {
            throw new Error('PROMPT_REQUIRED');
        } else {
            throw new Error('Output files already exist. Set force=true to overwrite.');
        }
    }

    // Create initial ignore instance with default patterns
    const ig = createInitialIgnore(additionalIgnorePatterns, ignoreDefaultPatterns);

    // Add patterns from root .gitignore if processGitignore is true
    if (!noGitignore) {
        const rootPatterns = readGitignorePatterns(repoRoot);
        if (rootPatterns.length > 0) {
            ig.add(rootPatterns);
        }
    }

    const structure = generateStructure(repoRoot, ig, repoRoot, '', additionalIgnorePatterns, !noGitignore);
    const content = generateContentFile(repoRoot, ig, repoRoot, additionalIgnorePatterns, maxFileSize, !noGitignore);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(path.join(outputDir, structureFile), structure);
    fs.writeFileSync(path.join(outputDir, contentFile), content);

    console.log(`Repository structure written to: ${path.join(outputDir, structureFile)}`);
    console.log(`Repository contents written to: ${path.join(outputDir, contentFile)}`);
}

module.exports = {
    parseFileSize,
    prettyFileSize,
    serializeRepo,
    DEFAULT_IGNORE_PATTERNS,
    ALWAYS_IGNORE_PATTERNS,
    DEFAULT_MAX_FILE_SIZE,
    MIN_FILE_SIZE,
    MAX_FILE_SIZE
};