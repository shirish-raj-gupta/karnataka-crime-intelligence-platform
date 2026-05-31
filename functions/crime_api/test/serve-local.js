"use strict";
/* Boots the Express app on a local port for manual/integration testing.
   Run: node test/serve-local.js  (default port 9000) */
const app = require("../index");
const port = process.env.PORT || 9000;
app.listen(port, () => console.log(`crime_api listening on http://localhost:${port}`));
