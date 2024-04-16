const axios = require('axios');
const fs = require('fs');
const path = require("path");

/**
 * Identify lagging dependencies for a project.
 * @param outputDir - The full path of the output directory.
 * @param projectPath - The full path of the project.
 * @returns {Promise<unknown>} - A promise that resolves to the lagging dependencies.
 */
exports.step4_lagDeps = function(outputDir, projectPath) {
    return new Promise(async (resolve, reject) => {
        console.log('Step4 (identify lagging dependencies) for project <' + path.basename(projectPath) + "> starts")

        const dependencyTree = JSON.parse(fs.readFileSync(path.join(outputDir, 'step1_output.json'), 'utf8'));

        const laggingDependencies = {};
        const releaseIntervals = {};
        try {
            for (const [packageName, packageInfo] of Object.entries(dependencyTree.dependencies)) {
                const versions = await fetchPackageVersions(packageName);
                if (versions) {
                    const { isLagging, releaseInterval } = calculateIfADependencyIsLagging(versions, packageInfo.version, packageName);
                    if (isLagging) {
                        laggingDependencies[packageName] = packageInfo.version;
                    }
                    releaseIntervals[packageName] = releaseInterval;
                }
            }
            writeLaggingDependenciesToFile(laggingDependencies, releaseIntervals, outputDir, projectPath);
            console.log('Step4 (identify lagging dependencies) for project <' + path.basename(projectPath) + "> ends\n---------------\n")
            resolve();
        } catch (error) {
            console.error('Error in checkLaggingDependencies:', error);
            reject(error);
        }
    });
};

/**
 * Fetch package info from deps.dev by calling its API.
 * @param packageName - The name of the package.
 * @returns {Promise<*|null>} - A promise that resolves to the package info.
 */
async function fetchPackageVersions(packageName) {
    try {
        const encodedPackageName = encodeURIComponent(packageName);
        const response = await axios.get(`https://api.deps.dev/v3alpha/systems/npm/packages/${encodedPackageName}`);
        return response.data.versions.map(v => ({ version: v.versionKey.version, publishedAt: v.publishedAt }));
    } catch (error) {
        console.error(`Error fetching package info for ${packageName}`);
        return null;
    }
}

/**
 * Calculate if a dependency is lagging based on its release dates.
 * @param {Array} versions - An array of version objects, each containing a 'publishedAt' property.
 * @param {string} currentVersion - The current version of the dependency.
 * @param packageName - The name of the dependency.
 * @returns {{isLagging: boolean, averageInterval: *}} - A boolean indicating if the dependency is lagging, and the average release interval.
 */
function calculateIfADependencyIsLagging(versions, currentVersion, packageName) {
    const a = 0.8; // Smoothing parameter, between 0 and 1
    let releaseInterval = 0;

    // Sort versions by their published date
    versions.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

    // Calculate the release intervals between each version
    const releaseIntervals = [];
    for (let i = 1; i < versions.length; i++) {
        releaseIntervals.push(new Date(versions[i].publishedAt) - new Date(versions[i - 1].publishedAt));
    }

    // Calculate the release interval using Exponential Smoothing
    for (let i = 0; i < releaseIntervals.length; i++) {
        releaseInterval += Math.pow((1 - a), i) * releaseIntervals[releaseIntervals.length - 1 - i];
    }
    releaseInterval *= a;

    // Find the last release date for the current version
    let lastRelease;
    for(let i = 0; i < versions.length; i++) {
        if (versions[i].version === currentVersion) {
            lastRelease = versions[i];
            break;
        }
    }
    if (!lastRelease) {
        return {
            isLagging: false,
            releaseInterval: -1
        };
    }

    const lastReleaseDate = new Date(lastRelease.publishedAt).getTime();

    const expectedReleaseDate = lastReleaseDate + releaseInterval;

    // Please note that expectedReleaseInterval is the same as releaseInterval
    // In this case, we calculate it again for the sake of clarity
    const expectedReleaseInterval = expectedReleaseDate - lastReleaseDate;

    const now = new Date().getTime();

    // Determine if the current version is lagging behind based on the average interval
    const isLagging = now > (lastReleaseDate + 2 * expectedReleaseInterval);

    const averageIntervalInDays = Math.round(releaseInterval / (1000 * 60 * 60 * 24));
    return {
        isLagging: isLagging,
        releaseInterval: averageIntervalInDays
    };
}

/**
 * Write lagging dependencies to a JSON file.
 * @param laggingDependencies - An array of lagging dependencies.
 * @param avgReleaseIntervals - An array of average release intervals for each dependency.
 * @param outputDir - The full path of the output directory.
 * @param projectName - The name of the project.
 */
function writeLaggingDependenciesToFile(laggingDependencies, avgReleaseIntervals, outputDir, projectName) {
    const filePath = path.join(outputDir, 'step4_output.json');
    const dataToWrite = {
        laggingDependencies: laggingDependencies,
        releaseInterval: avgReleaseIntervals
    };
    fs.writeFileSync(filePath, JSON.stringify(dataToWrite, null, 2), 'utf8');
}