// import { Octokit } from "@octokit/rest"
// const octokit = new Octokit();
import fetch from "node-fetch";
import * as fs from "fs";

/**
 * Config for the current script and GitHub API.
 */
const config = {
	organization: "ScratchAddons",
	githubToken: process.env.GH_PAT,
	fetch: {
		headers: {
			"User-Agent": "Hans5958",
			"Accept": "application/vnd.github.v3+json",
			"Authorization": `token ${process.env.GH_PAT}`,
		},
	},
	urls: {
		repos: "https://api.github.com/orgs/${org}/repos",
		contributors: "https://api.github.com/repos/${org}/${repo}/contributors",
		scratchAddonsContributors: "https://raw.githubusercontent.com/ScratchAddons/contributors/master/.all-contributorsrc",
	},
	outputFile: "dist/contributors.json",
};

/**
 * Fetch the contributors from both the GitHub API and the local file, merge them, and write the result to a file.
 */
await Promise
	.resolve()
	.then(() => console.log(`::set-output name=TIMESTAMP::${new Date().toISOString()}`))
	.then(() => Promise.all([getSrcContributors(config.urls.scratchAddonsContributors), getGitHubContributors(config.organization)]))
	.then(([srcContributors, gitHubContributors]) => {
		const contributorsInCommon = new Set([
			...srcContributors.map(contributor => contributor.login),
			...gitHubContributors.map(contributor => contributor.login),
		]);
		const contributors = [];
		srcContributors.forEach(contributor => {
			if (contributorsInCommon.has(contributor.login)) {
				contributors.push({ ...contributor, commits: gitHubContributors.find(contributor => contributor.login === contributor.login).contributions });
			} else {
				console.warn(`${contributor.name} was in the contributors file but hasn't made any commit. Adding them anyway.`);
				contributors.push({ ...contributor, commits: 0 });
			}
		});
		gitHubContributors
			.filter(contributor => !contributorsInCommon.has(contributor.login))
			.forEach(contributor => {
				const { login, contributions, avatar_url } = contributor;
				console.warn(`${contributor.login} has made commits but wasn't in the contributors file. Adding them anyway.`);
				contributors.push({ login, avatar_url, name: login, profile: `https://github.com/${login}`, commits: contributor.contributions });
			});
		return contributors;
	})
	.then(contributors => contributors.sort((a, b) => a.login.localeCompare(b.login)))
	.then(contributors => fs.promises.writeFile(config.outputFile, JSON.stringify(contributors, null, 4)))
	.catch(error => console.error(error));

/**
* Returns a list of all the contributors and in what way they contributed.
* @param {string} source The URL of the file with the contributors to fetch.
* @returns {Promise<SrcContributors[]>} The list of contributors, in a promise.
*/
function getSrcContributors(source) {
	return fetch(source)
		.then(response => {
			if (response.ok) return response;
			throw new Error(`Response not OK while fetching "${source}"`);
		})
		.then(response => response.json())
		.then(response => response.contributors);
}

/**
 * Returns a list of all the contributors to all the GitHub repositories of the organization.
 * @param {string} organization The name of the organization.
 * @returns {Promise<GitHubContributor[]>} The list of contributors, in a promise.
 */
function getGitHubContributors(organization) {
	return getAllGitHubOrgRepos(organization)
		.then(repos => repos.map(repo => getGitHubRepoContributors(organization, repo)))
		.then(requests => Promise.allSettled(requests))
		.then(promises => promises.filter(promise => {
			if (promise.status === "fulfilled") return true;
			console.warn(`Failed to retrieve contributors for a repository. This repo has been ignore but the script will continue.\nReason:\n${promise.reason}`);
			return false;
		}))
		.then(promises => promises.map(promise => promise.value))
		.then(contributors => contributors.flat(1))
		.then(contributors => contributors.reduce((contributors, contributor) => {
			const { id, login, contributions, avatar_url } = contributor;
			return contributors.has(id)
				? void (contributors.get(id).contributions += contributions) || contributors
				: contributors.set(id, { login, contributions, avatar_url });
		}, new Map()))
		.then(contributors => Array.from(contributors.values()));
}

/**
 * Fetches the name of all GitHib repos belonging to the organization, ignoring the forks.
 * @param {string} organization The name of the organization.
 * @returns {Promise<string[]>} The names of the repos, in a promise.
 */
 function getAllGitHubOrgRepos(organization) {
	return fetchGitHubAPIJson(config.urls.repos.replace("${org}", organization))
		// const { data } = await octokit.repos.listForOrg({org})
		.then(repos => repos.filter(repo => repo.fork === false))
		.then(repos => repos.map(repo => repo.name));
}

/**
 * Fetches the contributors from a GitHub repo belonging to the organization, only returning actual humans.
 * @param {string} organization The name of the organization.
 * @param {string} repo The name of the repo.
 * @returns {Promise<GitHubContributor[]>} The list of contributors, in a promise.
 */
function getGitHubRepoContributors(organization, repo) {
	return fetchGitHubAPIJson(config.urls.contributors.replace("${org}", organization).replace("${repo}", repo))
		// const { data } = await octokit.repos.listContributors({owner: org, repo})
		.then(response => response.contributors)
		.then(contributors => contributors.filter(contributor => contributor.type === "User"));
}

/**
 * Fetches and parses a JSON object from a URL belonging to the GitHub API.
 * @param {string} url The URL to fetch from the GitHub API.
 * @returns {Promise<unknown>} The parsed object, in a promise.
 */
 function fetchGitHubAPIJson(url) {
	return fetch(url, config.fetch)
		.then(response => {
			if (response.ok) return response;
			throw new Error(`Response not OK while fetching "${url}"`);
		})
		.then(response => response.json());
}

/**
 * Waits for a given amount of time.
 * @param {number} delay The amount of time to wait, in milliseconds.
 * @returns A promise that resolves after the given amount of time.
 */
function wait(delay) {
	return new Promise((resolve, _reject) => setTimeout(resolve, delay));
}
