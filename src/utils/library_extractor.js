const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const csv = require('csv-parser');

const librariesDir = path.resolve(__dirname, '../../libraries_to_scan');
const csvFilePath = path.resolve(__dirname, '../../libraries.csv');
const versionsToDownload = 10; // Number of versions to download

if (!fs.existsSync(librariesDir)) {
  fs.mkdirSync(librariesDir, { recursive: true });
}

/**
 * Download specific versions of a library
 * @param library - The name of the library
 * @param versions - The versions to download
 */
function downloadSpecificVersions(library, versions) {
  const libraryPath = path.join(librariesDir, library);
  if (!fs.existsSync(libraryPath)) {
    fs.mkdirSync(libraryPath, { recursive: true });
  }

  const versionsToProcess = versions.slice(-versionsToDownload);
  const alreadyDownloaded = fs.readdirSync(libraryPath);

  versionsToProcess.forEach(version => {
    const versionDirectory = path.join(libraryPath, `v${version}`);
    // Check if the version is already downloaded, skip if true
    if (!alreadyDownloaded.includes(`v${version}`)) {
      try {
        const tarballFilename = `${library}-${version}.tgz`;
        const tarballPath = path.join(versionDirectory, tarballFilename);

        if (!fs.existsSync(versionDirectory)) {
          fs.mkdirSync(versionDirectory, { recursive: true });
        }
        execSync(`npm pack ${library}@${version} --silent`, { stdio: 'ignore', cwd: versionDirectory });
        execSync(`tar -xzf ${tarballFilename} --strip-components=1`, { cwd: versionDirectory });
        fs.unlinkSync(tarballPath); // Remove the tarball after extraction
      } catch (error) {
        console.error(`Failed to download ${library}@${version}: ${error}`);
        return;
      }
    }
  });

  console.log(`Downloaded library ${library} successfully!`);
}

exports.downloadLibrariesAndVersions = function downloadLibrariesAndVersions() {
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (row) => {
      const library = row.library_name;
      try {
        const versions = JSON.parse(execSync(`npm view ${library} versions --json`, { stdio: 'pipe' }).toString());
        downloadSpecificVersions(library, versions);
      } catch (error) {
        console.error(`Failed to get versions for ${library}: ${error}`);
      }
    })
    .on('end', () => {
      console.log('Finished processing all libraries.');
    });
};
