// import { Octokit } from "@octokit/rest"
// const octokit = new Octokit()
import fetch from 'node-fetch'
import fs from 'fs'
import stringifyB from 'json-beautify'

const GITHUB_TOKEN = process.env.GH_PAT

const fetchJson = async url => {

	const response = await fetch(url, {
		headers: {
			"User-Agent": "Hans5958",
			Accept: "application/vnd.github.v3+json",
			Authorization: `token ${GITHUB_TOKEN}`
		}
	})
	return await response.json()
}

/**
 * Respond to the request
 * @param {Request} request
 */
const getCommits = async request => {
	try {
		const org = "ScratchAddons"
		// const { data } = await octokit.repos.listForOrg({org})
		const data = await fetchJson(`https://api.github.com/orgs/${org}/repos`)
		const repos = data.filter(repo => repo.fork === false).map(repo => repo.name)
		const totalContributors = []
		await Promise.all(repos.map(async repo => {
			// const { data } = await octokit.repos.listContributors({owner: org, repo})
			const data = await fetchJson(`https://api.github.com/repos/${org}/${repo}/contributors`)
				.catch(r => {
					console.log(r)
					return []
				})
			// console.log(data)
			data.forEach(contributor => {
				if (contributor.type === "User") {
					const index = totalContributors.findIndex(i => i.login === contributor.login)
					if (index === -1) {
						totalContributors.push({
							login: contributor.login,
							contributions: contributor.contributions,
							avatar_url: contributor.avatar_url
						})
					} else {
						totalContributors[index].contributions += contributor.contributions
					}
				}
			})
		}))
		totalContributors.sort((a, b, field='login') => (a[field] > b[field]) - (a[field] < b[field]))
		// console.log(stringifyB(totalContributors, null, '\t'))
		return totalContributors
		// })
	} catch (e) {
		console.error(e)
		// return new Response(e, { status: 503 })
	}
}

console.log(`::set-output name=TIMESTAMP::${new Date().toISOString()}`)

;(async () => {
	let contributors = []

	await Promise.all([

		// Fetch contributors data from ScratchAddons/contributors, with all-contributors spec
		(() => new Promise(async callback => {
			setTimeout(async () => {
				let response = await (await fetch("https://raw.githubusercontent.com/ScratchAddons/contributors/master/.all-contributorsrc")).json()
				// console.log(contributors)
				// console.log(response)
				response.contributors.forEach(responseItem => {
					let index = contributors.findIndex(contributorsItem => contributorsItem.login === responseItem.login)
					if (index === -1) {
						contributors.push({})
						index = contributors.length - 1
					}
					Object.assign(contributors[index], responseItem)
				})
				// console.log(contributors)
				// console.log(response)
				callback()
			}, 3000);
		}))(),

		// Fetch commit count data from all repositories
		(() => new Promise(async callback => {
			let response = await getCommits()
			while (contributors.length === 0) await new Promise(resolve => setTimeout(resolve, 250))
			response.forEach(responseItem => {
				let index = contributors.findIndex(contributorsItem => contributorsItem.login === responseItem.login)
				if (index === -1) {
					contributors.push({})
					index = contributors.length - 1
				}
				responseItem.commits = responseItem.contributions
				delete responseItem.contributions
				Object.assign(contributors[index], responseItem)
			})
			callback()
		}))()
	])

	fs.writeFileSync('contributors.json', stringifyB(contributors, null, '\t'))

})()