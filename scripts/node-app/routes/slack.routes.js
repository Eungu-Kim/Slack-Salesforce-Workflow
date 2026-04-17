const express = require("express");
const { handleSlackInteractions } = require("../controllers/slack.controller");

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Slack Salesforce bot server is running.");
});

router.post("/slack/interactions", handleSlackInteractions);

module.exports = router;
