const puppeteer = require('puppeteer');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

const debug = process.env.DEBUG?.toLowerCase().trim() == 'true';

const { Webhook } = require('simple-discord-webhooks');

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

  await page.evaluate(async () => {
    console.log("Selecting Melbourne location");
    document.querySelector("input#rbLocation135").click();

    console.log("Submitting form...");
    let submitBtn = document.querySelector("button#ContentPlaceHolder1_btnCont");
    submitBtn.disabled = false;
    submitBtn.click();
  });

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
    return gAvailSlotText;
  });

  console.log("Available appointment data:\n", appointmentData);

  // Send the webhook
  const webhook = new Webhook('DISCORD_WEBHOOK_URL_HERE');

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
  }

  console.log("Sending webhook");
  // await webhook.send(`<@168004824628068352> BVMS Appointments:\n\`\`\`${messageArr.join("\n")}\`\`\``);
  await webhook.send("<@168004824628068352>", [
    {
      fields: webhookFields,
    }
  ]);

  await page.screenshot({ path: 'screenshot.png' });

  await browser.close();
  console.log("All done!");
})();
