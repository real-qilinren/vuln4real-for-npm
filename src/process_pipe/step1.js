const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Extract dependency tree for each version of each project.
 * @param projectPath - The full path of the project version.
 * @param outputDir - The full path of the output directory for the project version.
 * @returns {Promise<void>} - A promise that resolves when the dependency tree has been written to the output.
 */
exports.step1_depsTree = function(projectPath, outputDir) {
  return new Promise((resolve, reject) => {
    console.log('Step1 (Extract dependency tree) for project version <' + path.basename(projectPath) + '> starts');

    exec('npm ls --depth=Infinity --json', { cwd: projectPath }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error while executing npm ls for <${path.basename(projectPath)}>:\n${stderr}`);

        // Check if the error is because of unmet dependencies
        if (stderr.includes('ELSPROBLEMS') || stderr.includes('unmet dependency')) {
          console.warn(`Skipping version <${path.basename(projectPath)}> due to unmet dependencies.`);
          // Resolve the promise without a tree object to indicate skipping
          resolve(null);
        } else {
          // For other errors, reject the promise
          reject(error);
        }
        return;
      }

      let tree;
      try {
        tree = JSON.parse(stdout);
      } catch (parseError) {
        console.error(`Error parsing npm ls output for <${path.basename(projectPath)}>:\n${parseError}`);
        reject(parseError);
        return;
      }

      const outputFilePath = path.join(outputDir, 'step1_output.json');
      fs.writeFile(outputFilePath, JSON.stringify(tree, null, 2), (writeError) => {
        if (writeError) {
          console.error(`Error writing dependency tree file for <${path.basename(projectPath)}>:\n${writeError}`);
          reject(writeError);
          return;
        }

        console.log('Step1 (Extract dependency tree) for project version <' + path.basename(projectPath) + '> ends\n---------------\n');
        resolve(tree);
      });
    });
  });
};