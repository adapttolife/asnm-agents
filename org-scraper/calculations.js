var accounts = 2;
var keysPerAccount = 1;
var totalKeys = accounts * keysPerAccount;
var tokensPerKeyPerDay = 250000;
var totalTokensPerDay = totalKeys * tokensPerKeyPerDay;

var states = 50;
var sports = 1000;
var combinations = states * sports;

var minutesInDay = 24 * 60;

var scrapeMinutesRunTime = 1;

var processesRunningAtSameTime = 1;

var daysNeededToComplete = combinations / (minutesInDay / scrapeMinutesRunTime);

var averageTokensPerRequest = 