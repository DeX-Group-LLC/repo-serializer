const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

/**
 * Configuration options for repository serialization
 * @typedef {Object} SerializeOptions
 * @property {string} repoRoot - The root directory of the repository to serialize
 * @property {string} outputDir - Directory where output files will be written
 * @property {string} structureFile - Name of the file to write structure to
 * @property {string} contentFile - Name of the file to write contents to
 * @property {string[]} additionalIgnorePatterns - Additional patterns to ignore
 * @property {boolean} [force] - Whether to overwrite existing files without prompting
 * @property {boolean} [isCliCall] - Whether this is being called from the CLI
 */

/**
 * Default files and directories to ignore
 */
const DEFAULT_IGNORE_PATTERNS = [
    '.git/',
    'package-lock.json',
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
 * @returns {Object} - Ignore instance with default patterns
 */
function createInitialIgnore(additionalPatterns) {
    const ig = ignore();
    ig.add(DEFAULT_IGNORE_PATTERNS);
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
 * @returns {string} - The file and folder structure.
 */
function generateStructure(dir, parentIg, repoRoot, prefix, additionalPatterns) {
    let structure = '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Create new ignore instance for this directory
    const ig = ignore().add(parentIg);

    // Add patterns from this directory's .gitignore if it exists
    const dirPatterns = readGitignorePatterns(dir);
    if (dirPatterns.length > 0) {
        ig.add(dirPatterns);
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
            structure += generateStructure(fullPath, ig, repoRoot, childPrefix, additionalPatterns);
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
 * @returns {string} - The file contents.
 */
function generateContentFile(dir, parentIg, repoRoot, additionalPatterns) {
    let contentFile = '';
    const entries = fs.readdirSync(dir);

    // Create new ignore instance for this directory
    const ig = ignore().add(parentIg);

    // Add patterns from this directory's .gitignore if it exists
    const dirPatterns = readGitignorePatterns(dir);
    if (dirPatterns.length > 0) {
        ig.add(dirPatterns);
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
            contentFile += generateContentFile(fullPath, ig, repoRoot, additionalPatterns);
        } else if (isTextFile(fullPath)) {
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
        additionalIgnorePatterns = [],
        force = false,
        isCliCall = false
    } = options;

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
    const ig = createInitialIgnore(additionalIgnorePatterns);

    // Add patterns from root .gitignore
    const rootPatterns = readGitignorePatterns(repoRoot);
    if (rootPatterns.length > 0) {
        ig.add(rootPatterns);
    }

    const structure = generateStructure(repoRoot, ig, repoRoot, '', additionalIgnorePatterns);
    const content = generateContentFile(repoRoot, ig, repoRoot, additionalIgnorePatterns);

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