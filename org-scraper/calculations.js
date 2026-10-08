var accounts = 2;
var keysPerAccount = 1;
var tokensPerKeyPerDay = 250000;
var states = 50;
var sports = 100;
var scrapeMinutesRunTime = 1;
var processesRunningAtSameTime = 1;

var totalKeys = accounts * keysPerAccount;
var totalTokensPerDay = totalKeys * tokensPerKeyPerDay;
var combinations = states * sports;
var minutesInDay = 24 * 60;
var daysNeededToComplete = (combinations / (minutesInDay / scrapeMinutesRunTime)) / processesRunningAtSameTime;
var averageMaxTokensPerRequest = totalTokensPerDay / ((minutesInDay / scrapeMinutesRunTime) * processesRunningAtSameTime);

console.log("Total Keys: " + totalKeys);
console.log("Total Tokens Per Day: " + totalTokensPerDay);
console.log("Combinations: " + combinations);
console.log("Days Needed To Complete: " + daysNeededToComplete);
console.log("Average Max Tokens Per Request: " + averageMaxTokensPerRequest);