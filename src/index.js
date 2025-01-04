const fs = require('fs');
const path = require('path');

/**
 * Configuration options for repository serialization
 * @typedef {Object} SerializeOptions
 * @property {string} repoRoot - The root directory of the repository to serialize
 * @property {string} outputDir - Directory where output files will be written
 * @property {string} structureFile - Name of the file to write structure to
 * @property {string} contentFile - Name of the file to write contents to
 * @property {string[]} additionalIgnorePatterns - Additional patterns to ignore
 */

/**
 * Default files and directories to ignore
 */
const DEFAULT_IGNORE_PATTERNS = [
    '.git/',
    'package-lock.json',
    'node_modules/',
];


/**
 * Checks if a file is a text file based on its content.
 * A file is considered text if it only contains printable characters.
 *
 * @param {string} filePath - The path to the file.
 * @returns {boolean} - True if the file is a text file, false otherwise.
 */
function isTextFile(filePath) {
    try {
        // Try to read the first 8KB of the file to determine if it's text
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(8192); // 8KB buffer
        const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
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
 * Checks if a file or directory should be ignored based on .gitignore rules.
 *
 * @param {string} filePath - The path to the file or directory.
 * @param {string[]} gitignorePatterns - The patterns from .gitignore files.
 * @param {string} repoRoot - The root directory of the repository.
 * @returns {boolean} - True if the file or directory should be ignored, false otherwise.
 */
function shouldIgnore(filePath, gitignorePatterns, repoRoot) {
    const normalizedPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');

    for (const pattern of gitignorePatterns) {
        // Handle directory-specific patterns
        const patternRegex = pattern
            .replace(/\./g, '\\.') // Escape dots
            .replace(/\*/g, '.*') // Convert globs to regex
            .replace(/\?/g, '.') // Convert ? to single character match
            .replace(/\[!\]/g, '[^]') // Convert negated character classes
            // Handle directory-only patterns (ending with /)
            .replace(/\/$/g, '(?:/.*)?$');

        const regex = new RegExp(`^${patternRegex}$`);
        if (regex.test(normalizedPath)) {
            return true;
        }

        // Check if any parent directory matches directory-only patterns
        const dirPattern = pattern.endsWith('/') ? pattern : pattern + '/';
        const dirRegex = new RegExp(`^${dirPattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}.*$`);
        if (dirRegex.test(normalizedPath + '/')) {
            return true;
        }
    }

    return false;
}

/**
 * Reads and parses .gitignore files to get ignore patterns.
 * Checks all directories from the given path up to the repo root.
 *
 * @param {string} startPath - The path to start looking for .gitignore files from.
 * @param {string} repoRoot - The root directory of the repository.
 * @returns {string[]} - An array of ignore patterns.
 */
function getGitignorePatterns(startPath, repoRoot) {
    let patterns = [];
    let currentPath = startPath;

    while (currentPath.length >= repoRoot.length) {
        const gitignorePath = path.join(currentPath, '.gitignore');

        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            const localPatterns = content.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(pattern => {
                    // Make the pattern relative to the .gitignore file's location
                    const relativePath = path.relative(repoRoot, currentPath);
                    return relativePath ? path.join(relativePath, pattern).replace(/\\/g, '/') : pattern;
                });
            patterns.push(...localPatterns);
        }

        // Move up one directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) break; // Stop if we can't go up anymore
        currentPath = parentPath;
    }

    return patterns;
}

/**
 * Generates the file and folder structure of the repository.
 *
 * @param {string} dir - The directory to traverse.
 * @param {string[]} parentGitignorePatterns - The patterns from parent .gitignore files.
 * @param {string} repoRoot - The root directory of the repository.
 * @param {string} prefix - The prefix for indentation.
 * @returns {string} - The file and folder structure.
 */
function generateStructure(dir, parentGitignorePatterns, repoRoot, prefix = '') {
    let structure = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Add root folder name if this is the root level (empty prefix)
    if (prefix === '') {
        structure += `${path.basename(dir)}/\n`;
    }

    // Get gitignore patterns for this directory
    const gitignorePatterns = [...parentGitignorePatterns, ...getGitignorePatterns(dir, repoRoot)];

    // Filter and sort entries
    const validEntries = entries
        .filter(entry => !shouldIgnore(path.join(dir, entry.name), gitignorePatterns, repoRoot))
        .sort((a, b) => {
            // Directories come first, then sort alphabetically
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
            structure += generateStructure(fullPath, gitignorePatterns, repoRoot, childPrefix);
        }
    });

    return structure;
}

/**
 * Generates a file containing the contents of all text files in the repository.
 *
 * @param {string} dir - The directory to traverse.
 * @param {string[]} gitignorePatterns - The patterns from .gitignore files.
 * @param {string} repoRoot - The root directory of the repository.
 * @returns {string} - The file contents.
 */
function generateContentFile(dir, parentGitignorePatterns, repoRoot) {
    let contentFile = '';
    const entries = fs.readdirSync(dir);

    // Get gitignore patterns for this directory
    const gitignorePatterns = [...parentGitignorePatterns, ...getGitignorePatterns(dir, repoRoot)];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);

        if (shouldIgnore(fullPath, gitignorePatterns, repoRoot)) {
            continue;
        }

        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            contentFile += generateContentFile(fullPath, gitignorePatterns, repoRoot);
        } else if (isTextFile(fullPath)) {
            const relativePath = path.relative(repoRoot, fullPath);
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
 * @param {SerializeOptions} options - Configuration options
 */
function serializeRepo(options) {
    const {
        repoRoot,
        outputDir,
        structureFile,
        contentFile,
        additionalIgnorePatterns = []
    } = options;

    // Start with default patterns, add root .gitignore patterns and any additional patterns
    const gitignorePatterns = [
        ...DEFAULT_IGNORE_PATTERNS,
        ...additionalIgnorePatterns,
        ...getGitignorePatterns(repoRoot, repoRoot)
    ];

    const structure = generateStructure(repoRoot, gitignorePatterns, repoRoot);
    const content = generateContentFile(repoRoot, gitignorePatterns, repoRoot);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(path.join(outputDir, structureFile), structure);
    fs.writeFileSync(path.join(outputDir, contentFile), content);

    console.log(`Repository structure written to: ${path.join(outputDir, structureFile)}`);
    console.log(`Repository contents written to: ${path.join(outputDir, contentFile)}`);
}

module.exports = {
    serializeRepo,
    DEFAULT_IGNORE_PATTERNS
};