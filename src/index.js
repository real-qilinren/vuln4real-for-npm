const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { step1_depsTree } = require('./process_pipe/step1');
const { step2_devDeps } = require('./process_pipe/step2');
const { step3_withinProjectDeps } = require('./process_pipe/step3');
const { step4_lagDeps } = require('./process_pipe/step4');
const { step5_vulnerableDeps } = require('./process_pipe/step5');
const { step6_constructPath } = require('./process_pipe/step6');
const { downloadLibrariesAndVersions } = require('./utils/library_extractor');
const projectsDir = path.join(__dirname, '../libraries_to_scan');
const outputBaseDir = path.join(__dirname, '../output');

// Ensure the base output directory exists
if (!fs.existsSync(outputBaseDir)) {
  fs.mkdirSync(outputBaseDir, { recursive: true });
}

/**
 * Check if the required files for step6 exist.
 * @param outputDir - The directory where the output files should be located.
 * @returns {boolean} - True if all required files exist, false otherwise.
 * In this case, simply checking if the step1 output file exists is enough.
 */
function checkRequiredFiles(outputDir) {
  const requiredFiles = [
    'step1_output.json',
  ];
  return requiredFiles.every(file => fs.existsSync(path.join(outputDir, file)));
}


/**
 * Main function and entry point of the program.
 * The logic of index.js can be summarized as follows:
 * 1. Git clone all the repositories in the libraries_to_scan directory.
 * 2. For each project, execute the following steps:
 *   1. Install dependencies.
 *   2. Dedupe dependencies.
 *   3. Extract dependency tree.
 *   4. Identify development only dependencies.
 *   5. Identify within-project dependencies.
 *   6. Identify lagging dependencies.
 *   7. Identify vulnerable dependencies.
 */
const processProjects = async () => {
  // First, download libraries and their versions
  // await downloadLibrariesAndVersions();

  // After the download is complete, scan the projects directory
  const projectsToScan = fs.readdirSync(projectsDir).filter((file) => {
    return fs.statSync(path.join(projectsDir, file)).isDirectory();
  });

  for (const projectName of projectsToScan) {
    const projectPath = path.join(projectsDir, projectName);

    // Get all version directories for the current project
    const versionDirs = fs.readdirSync(projectPath).filter((file) => {
      return fs.statSync(path.join(projectPath, file)).isDirectory();
    });

    for (const version of versionDirs) {
      const versionPath = path.join(projectPath, version);
      const outputDir = path.join(outputBaseDir, `${projectName}_output`, version);

      // Ensure the individual output directory for this version exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      try {
        // Install dependencies with --legacy-peer-deps and --force flags to avoid/ignore conflicts between dependencies.
        await execAsync('npm install --legacy-peer-deps --force --ignore-scripts', { cwd: versionPath });
      } catch (installError) {
        console.error(`Error installing dependencies for ${projectName}@${version}:`, installError);
      }

      try {
        // Dedupe dependencies to avoid conflicts between dependencies.
        await execAsync('npm dedupe', { cwd: versionPath });
      } catch (dedupeError) {
        console.error(`Error executing npm dedupe in ${versionPath}:`, dedupeError);
      }

      // Check if all required files exist
      if (!checkRequiredFiles(outputDir)) {
          console.error('Required files for step2-6 are missing. Exiting the process for project <' + path.basename(projectPath) + '>.');
          continue;
      }
      // // Execute the steps for each version. Make sure each step function supports the version-specific paths.
      // const tree = await step1_depsTree(versionPath, outputDir);
      // if (!tree) continue; // Skip steps 2-6 if we failed to extract the dependency tree
      //
      // // Only proceed if step1 was successful
      // await step2_devDeps(versionPath, outputDir);
      // await step3_withinProjectDeps(versionPath, outputDir);
      // await step4_lagDeps(outputDir, outputDir);
      //await step5_vulnerableDeps(versionPath, outputDir);
      await step6_constructPath(versionPath, outputDir);
    }
  }
};

// Start the entire process
processProjects().then(() => {
  console.log('All projects have been processed.');
}).catch((error) => {
  console.error('An error occurred during project processing:', error);
});
