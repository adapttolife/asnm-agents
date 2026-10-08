const keysPerAccount = 1;
const maxRequestsPerMinutePerKey = 15;
const maxTokensPerMinutePerKey = 250000;
const maxRequestsPerDayPerKey = 500;

var accounts = 2;
var states = 50;
var sports = 100;
var averageMinutesPerRequest = 1;
var processesRunningAtSameTime = 2;
var averageTokensPerRequest = 600;

var totalKeys = accounts * keysPerAccount;
var minutesInDay = 24 * 60;
var maxTokensPerDay = totalKeys * maxTokensPerMinutePerKey * minutesInDay;
var maxTokensPerMinute = totalKeys * maxTokensPerMinutePerKey;
var combinations = states * sports;
var maxRequestsPerDay = Math.floor(maxTokensPerDay / averageTokensPerRequest);
var maxRequestsPerMinute = Math.floor(maxTokensPerMinute / averageTokensPerRequest);
var wantedRequestsPerDay = Math.ceil((minutesInDay / averageMinutesPerRequest) * processesRunningAtSameTime);
var wantedRequestsPerMinute = Math.ceil((1 / averageMinutesPerRequest) * processesRunningAtSameTime);
var requestsPerDay = Math.min(maxRequestsPerDay, wantedRequestsPerDay);
var requestsPerMinute = Math.min(maxRequestsPerMinute, wantedRequestsPerMinute);
var daysNeededToComplete = Math.ceil(combinations / requestsPerDay);

console.log(`Total keys: ${totalKeys}`);
console.log(`Max tokens per day: ${maxTokensPerDay}`);
console.log(`Max tokens per minute: ${maxTokensPerMinute}`);
console.log(`Max requests per day: ${maxRequestsPerDay}`);
console.log(`Max requests per minute: ${maxRequestsPerMinute}`);
console.log(`Wanted requests per day: ${wantedRequestsPerDay}`);
console.log(`Wanted requests per minute: ${wantedRequestsPerMinute}`);
console.log(`Requests per day: ${requestsPerDay}`);
console.log(`Requests per minute: ${requestsPerMinute}`);
console.log(`Days needed to complete: ${daysNeededToComplete}`);