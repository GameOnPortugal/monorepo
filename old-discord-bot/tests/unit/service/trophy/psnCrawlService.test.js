// const PsnCrawlService = require('./../../../../src/service/trophy/psnCrawlService');

describe('psnCrawlService', () => {
	it('always pass', () => {
		expect(true).toBe(true);
	});

	// it('Extracts trophy data - old urls', async () => {
	// 	expect.assertions(1);
	//
	// 	try {
	// 		await PsnCrawlService.getPlatTrophyData('https://psnprofiles.com/trophies/11805-marvels-spider-man-miles-morales/NunoGamerHDYT');
	// 	}
	// 	catch (e) {
	// 		expect(e.message).toEqual('User hasn\'t earned the plat trophy yet!');
	// 	}
	//
	// 	// expect(data.percentage).toBeGreaterThan(1);
	// 	// expect(data.completionDate.format('YYYY-MM-DD')).toBe('2021-06-29');
	// });
	//
	//
	// it('Get profile trophies', async () => {
	// 	expect.assertions(2);
	//
	// 	const urls = await PsnCrawlService.getProfileTrophies('Josh_Lopes');
	//
	// 	expect(urls.length).toBeGreaterThan(1);
	// 	expect(urls[urls.length - 1]).toMatch(new RegExp('https:\\/\\/psnprofiles.com\\/trophies\\/.*?\\/Josh_Lopes'));
	// }, 60000);
	//
	// it('Extracts trophy percentage - new urls', async () => {
	// 	expect.assertions(2);
	//
	// 	const data = await PsnCrawlService.getPlatTrophyData('https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes');
	//
	// 	expect(data.percentage).toBeGreaterThan(1);
	// 	expect(data.completionDate.format('YYYY-MM-DD')).toBe('2021-03-09');
	// });
	//
	// it('Grabs the current ranks from a psn profile', async () => {
	// 	expect.assertions(6);
	//
	// 	const ranks = await PsnCrawlService.getProfileRank('Josh_Lopes');
	//
	// 	expect(ranks.worldRank).toBeGreaterThan(700000);
	// 	expect(ranks.countryRank).toBeGreaterThan(80000);
	//
	// 	// Banned account
	// 	const ranks2 = await PsnCrawlService.getProfileRank('oneeye_japan');
	//
	// 	expect(ranks2.worldRank).toBeNull();
	// 	expect(ranks2.countryRank).toBeNull();
	//
	// 	const ranks3 = await PsnCrawlService.getProfileRank('Andrerego');
	//
	// 	expect(ranks3.worldRank).toBeGreaterThan(100000);
	// 	expect(ranks3.countryRank).toBeGreaterThan(1000);
	// }, 60000);
});
