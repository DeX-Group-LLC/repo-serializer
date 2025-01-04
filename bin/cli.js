#!/usr/bin/env node

const { program } = require('commander');
const { serializeRepo } = require('../src/index');
const path = require('path');

program
    .name('repo-serialize')
    .description('Serialize a repository\'s structure and contents into readable text files')
    .version('1.0.0')
    .option('-d, --dir <directory>', 'Target directory to serialize', process.cwd())
    .option('-o, --output <directory>', 'Output directory for generated files', process.cwd())
    .option('--structure-file <filename>', 'Name of the structure output file', 'repo_structure.txt')
    .option('--content-file <filename>', 'Name of the content output file', 'repo_content.txt')
    .option('--ignore <patterns...>', 'Additional patterns to ignore')
    .parse(process.argv);

const options = program.opts();

try {
    serializeRepo({
        repoRoot: path.resolve(options.dir),
        outputDir: path.resolve(options.output),
        structureFile: options.structureFile,
        contentFile: options.contentFile,
        additionalIgnorePatterns: options.ignore || []
    });
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}