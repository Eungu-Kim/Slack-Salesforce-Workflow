const express = require("express");
const { PORT } = require("./config/env");
const slackRoutes = require("./routes/slack.routes");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/", slackRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});