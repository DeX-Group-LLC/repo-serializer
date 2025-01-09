const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

/** @constant {string} FILE_SEPARATOR - Separator line for file boundaries */
const FILE_SEPARATOR = '='.repeat(60);

/** @constant {string} CONTENT_SEPARATOR - Separator line for content sections */
const CONTENT_SEPARATOR = '-'.repeat(60);

/**
 * Wraps content with file separators
 * @param {string} relativePath - The relative path of the file
 * @param {string} content - The content to wrap
 * @returns {string} - The wrapped content with separators
 */
function wrapWithSeparators(relativePath, content) {
    return [
        '',  // First newline for visual separation between files
        '',  // Second newline for visual separation between files
        FILE_SEPARATOR,
        `START OF FILE: ${relativePath}`,
        CONTENT_SEPARATOR,
        content,
        CONTENT_SEPARATOR,
        `END OF FILE: ${relativePath}`,
        FILE_SEPARATOR,
    ].join('\n');
}

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
 * @property {boolean} [silent] - Whether to suppress console output (default: false)
 * @property {boolean} [verbose] - Whether to enable verbose logging of all processed and ignored files (default: false)
 * @property {boolean} [hierarchicalContent] - Whether to serialize content in hierarchical order (default: false)
 * @property {number} [maxReplacementRatio] - Maximum allowed ratio of replacement characters (0-1)
 * @property {boolean} [keepReplacementChars] - Whether to keep replacement characters in output (default: false)
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

/** @constant {number} DEFAULT_REPLACEMENT_RATIO - Default maximum replacement character ratio */
const DEFAULT_REPLACEMENT_RATIO = 0;

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
 * Checks if a string has a high ratio of replacement characters (U+FFFD),
 * which would indicate it's likely not a text file in this encoding
 *
 * @param {string} text - The text to check
 * @param {number} [maxRatio] - Maximum allowed ratio of replacement characters (between 0 and 1)
 * @returns {boolean} - True if the text has too many replacement characters
 * @throws {Error} If maxRatio is not between 0 and 1
 */
function hasHighReplacementCharacterRatio(text, maxRatio) {
    const replacementChar = '\uFFFD';

    // For maxRatio of 0, just check if the replacement character exists
    if (maxRatio === 0) return text.includes(replacementChar);

    // Otherwise calculate the ratio
    const replacementCount = (text.match(new RegExp(replacementChar, 'g')) || []).length;
    return (replacementCount / text.length) > maxRatio;
}

/**
 * Checks if a file is a text file and within size limit
 *
 * @param {string} filePath - The path to the file
 * @param {number} maxFileSize - Maximum file size in bytes
 * @param {number} [maxReplacementRatio] - Maximum allowed ratio of replacement characters
 * @returns {boolean} - True if the file is a text file and within size limit
 */
function isTextFile(filePath, maxFileSize, maxReplacementRatio) {
    try {
        const stats = fs.statSync(filePath);

        // Try to read the first chunk of the file to determine if it's text
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(Math.min(maxFileSize, stats.size)); // Read up to maxFileSize or file size
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        // If file is empty, consider it text
        if (bytesRead === 0) return true;

        // Decode as UTF-8 (handles BOM automatically)
        const text = buffer.toString('utf8');

        // Replace control characters (except Tab, LF, VT, FF, CR) with replacement character
        const processedText = replaceControlCharacters(text);

        return !hasHighReplacementCharacterRatio(processedText, maxReplacementRatio);
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
 * @param {boolean} [ignoreDefaultPatterns] - Whether to skip adding default ignore patterns
 * @param {boolean} [verbose] - Whether to enable verbose logging
 * @returns {Object} - Ignore instance with configured patterns
 */
function createInitialIgnore(additionalPatterns, ignoreDefaultPatterns, verbose) {
    const ig = ignore();
    ig.add(ALWAYS_IGNORE_PATTERNS);

    // Add default patterns unless ignoreDefaultPatterns is true
    if (!ignoreDefaultPatterns) {
        ig.add(DEFAULT_IGNORE_PATTERNS);
        if (verbose) console.log('Added default ignore patterns');
    }

    if (additionalPatterns.length > 0) {
        ig.add(additionalPatterns);
        if (verbose) console.log('Added additional ignore patterns');
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
 * Replaces control characters with replacement characters
 * @param {string} text - The text to process
 * @returns {string} - Text with control characters replaced
 */
function replaceControlCharacters(text) {
    return text.replace(/[\u0000-\u0008\u000E-\u001F]/g, '\uFFFD');
}

/**
 * Strips replacement characters from text
 * @param {string} text - The text to process
 * @returns {string} - Text with replacement characters removed
 */
function stripReplacementCharacters(text) {
    return text.replace(/\uFFFD/g, '');
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
 * @param {boolean} silent - Whether to suppress console output
 * @param {boolean} verbose - Whether to enable verbose logging of all processed and ignored files
 * @param {boolean} hierarchical - Whether to use hierarchical ordering
 * @param {number} maxReplacementRatio - Maximum allowed ratio of replacement characters
 * @param {boolean} keepReplacementChars - Whether to keep replacement characters in output
 * @returns {string} - The file contents.
 */
function generateContentFile(dir, parentIg, repoRoot, additionalPatterns, maxFileSize, processGitignore, silent, verbose, hierarchical, maxReplacementRatio, keepReplacementChars) {
    let contentFile = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Create new ignore instance for this directory
    const ig = ignore().add(parentIg);

    // Add patterns from this directory's .gitignore if it exists and processGitignore is true
    if (processGitignore) {
        const dirPatterns = readGitignorePatterns(dir);
        if (dirPatterns.length > 0) {
            ig.add(dirPatterns);
            if (verbose) {
                console.log(`Added gitignore patterns from: ${path.relative(repoRoot, dir) != '' ? path.relative(repoRoot, dir) + '/' : ''}.gitignore`);
            }
        }
    }

    // Filter and sort entries
    const validEntries = entries
        .sort((a, b) => {
            if (!hierarchical) {
                // For non-hierarchical mode, directories before files then alphabetical
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
            }
            return a.name.localeCompare(b.name);
        });

    for (const entry of validEntries) {
        const fullPath = path.join(dir, entry.name);
        let relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            relativePath += '/';
        }

        if (ig.ignores(relativePath)) {
            if (verbose) {
                console.log(`Ignoring: ${relativePath}`);
            }
            continue;
        }

        if (entry.isDirectory()) {
            if (verbose) {
                console.log(`Adding directory: ${relativePath}`);
            }
            contentFile += '\n\n';
            contentFile += generateContentFile(fullPath, ig, repoRoot, additionalPatterns, maxFileSize, processGitignore, silent, verbose, hierarchical, maxReplacementRatio, keepReplacementChars);
        } else if (isTextFile(fullPath, maxFileSize, maxReplacementRatio)) {
            if (verbose) {
                console.log(`Adding file: ${relativePath}`);
            }
            contentFile += wrapWithSeparators(
                relativePath,
                keepReplacementChars ?
                    replaceControlCharacters(fs.readFileSync(fullPath, 'utf-8')) :
                    stripReplacementCharacters(replaceControlCharacters(fs.readFileSync(fullPath, 'utf-8')))
            );
        } else if (!silent) {
            console.log(`Skipping non-text file from content file: ${relativePath}`);
        }
    }

    return contentFile.trimStart();
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
 * @param {boolean} [options.silent=false] - Whether to suppress console output.
 * @param {boolean} [options.verbose=false] - Whether to enable verbose logging of all processed and ignored files.
 * @param {boolean} [options.hierarchicalContent=false] - Whether to serialize content in hierarchical order.
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
        noGitignore = false,
        silent = false,
        verbose = false,
        hierarchicalContent = false,
        maxReplacementRatio = DEFAULT_REPLACEMENT_RATIO,
        keepReplacementChars = false
    } = options;

    // Validate maxFileSize
    if (maxFileSize < MIN_FILE_SIZE || maxFileSize > MAX_FILE_SIZE) {
        throw new Error(`Max file size must be between ${prettyFileSize(MIN_FILE_SIZE)} and ${prettyFileSize(MAX_FILE_SIZE)}`);
    }

    // Validate verbose and silent cannot be used together
    if (verbose && silent) {
        throw new Error('Cannot use verbose and silent options together');
    }

    // Validate maxReplacementRatio
    if (maxReplacementRatio < 0 || maxReplacementRatio > 1) {
        throw new Error('Max replacement ratio must be between 0 and 1');
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
    const ig = createInitialIgnore(additionalIgnorePatterns, ignoreDefaultPatterns, verbose);

    const structure = generateStructure(repoRoot, ig, repoRoot, '', additionalIgnorePatterns, !noGitignore);
    const content = generateContentFile(repoRoot, ig, repoRoot, additionalIgnorePatterns, maxFileSize, !noGitignore, silent, verbose, hierarchicalContent, maxReplacementRatio, keepReplacementChars);

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
    DEFAULT_REPLACEMENT_RATIO,
    MIN_FILE_SIZE,
    MAX_FILE_SIZE
};