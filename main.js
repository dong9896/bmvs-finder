const puppeteer = require('puppeteer');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

const debug = process.env.DEBUG?.toLowerCase().trim() == 'true';

var githubRefName = process.env.GITHUB_REF_NAME;
var githubJobId = process.env.GITHUB_JOB;

const locationName = process.env.LOCATION_NAME;
const locationInputId = process.env.LOCATION_INPUT_ID;
const maxRows = parseInt(process.env.MAX_ROWS) || 3;

const { Webhook } = require('simple-discord-webhooks');

var exitWithError = false;
if (!locationName) {
  console.error("LOCATION_NAME not set");
  exitWithError = true;
}
if (!locationInputId) {
  console.error("LOCATION_INPUT_ID not set");
  exitWithError = true;
}

if (exitWithError) {
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    executablePath: path.resolve("/usr/bin/google-chrome"),
  });
  const page = await browser.newPage();
  if (debug == true) {
    page.on('console', consoleObj => console.log(consoleObj.text()));
  }
  page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36");

  await page.goto("https://bmvs.onlineappointmentscheduling.net.au/oasis/", {
    waitUntil: [
      "load",
      "domcontentloaded",
      "networkidle0",
      "networkidle2",
    ]
  });

  // Click the 'New Individual booking button'
  await page.evaluate(async () => {
    document.querySelector("button#ContentPlaceHolder1_btnInd").click();
  });

  await delay(1000);

  await page.evaluate(async () => {
    console.log("Setting postcode");
    document.querySelector("input[name='ctl00$ContentPlaceHolder1$SelectLocation1$txtSuburb']").value = 3000;
    console.log("Setting state");
    document.querySelector("select[name='ctl00$ContentPlaceHolder1$SelectLocation1$ddlState']").value = "VIC"
    console.log("Submitting location form");
    document.querySelector("input[type=submit]").click();
  });

  await page.waitForNavigation();

  // Selecting a location triggers an annoying alert dialog - Dismiss this
  const onDialogDismiss = page.on('dialog', async dialog => {
    console.log(dialog.message());
    await dialog.dismiss();
  });

  await page.evaluate(async (locationName, locationInputId) => {
    console.log(`Selecting location: ${locationName}`);
    document.querySelector(`input#${locationInputId}`).click();

    console.log("Submitting form...");
    let submitBtn = document.querySelector("button#ContentPlaceHolder1_btnCont");
    submitBtn.disabled = false;
    submitBtn.click();
  }, locationName, locationInputId);

  await page.waitForNavigation();

  // Select the 501 and 502 assessmeents
  await page.evaluate(async () => {
    console.log("Selecting 'Medical Examination (501)'");
    document.querySelector("input#chkClass1_489").click();
    console.log("Selecting 'Chest X-Ray (502)'");
    document.querySelector("input#chkClass1_492").click();
    console.log("Submitting form...");
    document.querySelector("button#ContentPlaceHolder1_btnCont").click();
  });

  await page.waitForNavigation();

  // Get data
  var appointmentData = await page.evaluate(async () => {
    return document.querySelector("#divPaginationNavigation > button");
    //return gAvailSlotText;
  });

  console.log("Available appointment data:\n", appointmentData);

  // Send the webhook
  const webhook = new Webhook('https://discord.com/api/webhooks/1192824433707057162/0Ce_05Q_wDMLdChPJNoZx-cG0zvfbsMGJrW4jr3YYseB4nI5G1XmX5octCsTKcYcWdvj');

  // Build the string
  var messageArr = [];
  for (const [key, value] of Object.entries(appointmentData)) {
    messageArr.push(`${key}: ${value}`);
  }

  var webhookFields = [];
  for (const [key, value] of Object.entries(appointmentData)) {
    let date = new Date(Date.parse(key));
    // let dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    webhookFields.push({ name: date.toDateString(), value: value, inline: false });

    // Break out of this loop if webhookFields is equal to or greater than maxRows.
    if (webhookFields.length >= maxRows) {
      break;
    }
  }

  webhookFooter = {};
  if (githubRefName) {
    webhookFooter.text = `via GitHub ref ${githubRefName}`;
    webhookFooter.url = `https://github.com/zerocube/jkueh-bmvs-finder/runs/${githubJobId}`;
  }

  console.log("Sending webhook");
  // await webhook.send(`<@168004824628068352> BVMS Appointments:\n\`\`\`${messageArr.join("\n")}\`\`\``);
  await webhook.send(`<@168004824628068352>`, [
    {
      title: `Appointments available at Bupa ${locationName}`,
      fields: webhookFields,
      footer: webhookFooter,
    }
  ]);

  await page.screenshot({ path: 'screenshot.png' });

  await browser.close();
  console.log("All done!");
})();
